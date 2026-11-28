import type { LoggerService } from '@nestjs/common';
import type { LlmProvider } from './interfaces/llm-provider.interface';
import type {
  DeliveryTurnContext,
  LlmToolCall,
  LlmToolRequest,
  LlmToolResponse,
  ToolHandler,
  ToolLoopResult,
  ToolResult,
} from '../verticals/delivery/contracts';

/** SPEC §8: máximo 4 iteraciones de herramientas por turno. */
export const DEFAULT_MAX_TOOL_ITERATIONS = 4;

export interface RunToolLoopParams {
  /** Request base (system prompt, historial, tools, modelo, timeout). No se muta. */
  request: LlmToolRequest;
  /** Registro de handlers por nombre de herramienta. */
  handlers: Record<string, ToolHandler>;
  ctx: DeliveryTurnContext;
  /** Por defecto 4 (mínimo 1). */
  maxIterations?: number;
}

/**
 * S1.3-T3: bucle genérico de tool calling.
 * - Llama a `generateWithTools`; si hay tool calls los ejecuta EN ORDEN (los handlers pueden
 *   tener efectos, p. ej. carrito) y agrega los mensajes assistant/tool; repite.
 * - Termina cuando el modelo responde texto sin tool calls → `{ finalText }`.
 * - Fallo del proveedor → corta con `fallbackReason = reason` (TIMEOUT | PROVIDER_ERROR | INVALID_RESPONSE).
 * - Iteraciones agotadas → `fallbackReason: 'MAX_ITERATIONS'`.
 * - Tool desconocido → `{ok:false, error:'UNKNOWN_TOOL'}`; handler que lanza → `{ok:false, error:'TOOL_ERROR'}`;
 *   ambos se devuelven al modelo sin romper el bucle.
 * - Log estructurado sin PII: solo iteraciones, nombres de tools, ok y latencias.
 */
export async function runToolLoop(
  provider: LlmProvider,
  params: RunToolLoopParams,
  logger?: Pick<LoggerService, 'log' | 'warn'>,
): Promise<ToolLoopResult> {
  const { request, handlers, ctx } = params;
  const maxIterations = Math.max(
    1,
    Math.floor(params.maxIterations ?? DEFAULT_MAX_TOOL_ITERATIONS),
  );
  const messages: LlmToolRequest['messages'] = [...request.messages];
  const toolTrace: ToolLoopResult['toolTrace'] = [];
  let llmLatencyMs = 0;

  const finish = (iterations: number, result: ToolLoopResult): ToolLoopResult => {
    const entry = {
      event: 'llm.tool_loop',
      conversationId: ctx.conversationId,
      iterations,
      toolCalls: toolTrace,
      llmLatencyMs,
      fallbackReason: result.fallbackReason ?? null,
    };
    if (result.fallbackReason) logger?.warn(JSON.stringify(entry));
    else logger?.log(JSON.stringify(entry));
    return result;
  };

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const startedAt = Date.now();
    let res: LlmToolResponse;
    try {
      res = await provider.generateWithTools({ ...request, messages: [...messages] });
    } catch {
      res = { ok: false, reason: 'PROVIDER_ERROR' }; // defensa: el contrato dice que no lanza
    }
    llmLatencyMs += Date.now() - startedAt;

    if (!res.ok) {
      return finish(iteration, { finalText: null, toolTrace, fallbackReason: res.reason });
    }
    if (res.toolCalls.length === 0) {
      return res.text
        ? finish(iteration, { finalText: res.text, toolTrace })
        : finish(iteration, { finalText: null, toolTrace, fallbackReason: 'INVALID_RESPONSE' });
    }

    messages.push({ role: 'assistant', content: res.text ?? '', toolCalls: res.toolCalls });
    for (const call of res.toolCalls) {
      const result = await executeTool(call, handlers, ctx);
      toolTrace.push({ name: call.name, ok: result.ok });
      messages.push({ role: 'tool', toolCallId: call.id, content: serializeToolResult(result) });
    }
  }

  return finish(maxIterations, { finalText: null, toolTrace, fallbackReason: 'MAX_ITERATIONS' });
}

async function executeTool(
  call: LlmToolCall,
  handlers: Record<string, ToolHandler>,
  ctx: DeliveryTurnContext,
): Promise<ToolResult> {
  const handler = Object.prototype.hasOwnProperty.call(handlers, call.name)
    ? handlers[call.name]
    : undefined;
  if (!handler) return { ok: false, error: 'UNKNOWN_TOOL' };
  try {
    const result = await handler(call.arguments ?? {}, ctx);
    return result && typeof result.ok === 'boolean' ? result : { ok: false, error: 'TOOL_ERROR' };
  } catch {
    return { ok: false, error: 'TOOL_ERROR' };
  }
}

/** JSON compacto (sin espacios). Resultados no serializables → error explícito para el modelo. */
export function serializeToolResult(result: ToolResult): string {
  try {
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({ ok: false, error: 'UNSERIALIZABLE_RESULT' });
  }
}
