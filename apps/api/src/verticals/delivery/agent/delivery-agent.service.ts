import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/llm.service';
import type { LlmProvider } from '../../../llm/interfaces/llm-provider.interface';
import type {
  ConversationalCandidates,
  DeliveryTurnContext,
  LlmToolDef,
  LlmToolRequest,
  ToolHandler,
  ToolResult,
  VariantCandidate,
} from '../contracts';
import { CatalogMatcherService } from '../catalog/catalog-matcher.service';
import { BusinessInfoTool } from './tools/business-info.tool';
import { CartTools } from './tools/cart.tools';
import { CatalogTools } from './tools/catalog.tools';
import { DeliveryTools } from './tools/delivery.tools';
import { PaymentTools } from './tools/payment.tools';
import { ConfirmTools } from './tools/confirm.tools';
import { OpeningHoursGuard } from '../handler/guards/opening-hours.guard';
import { parseOrderText } from './fallback-parser';
import { buildDeliverySystemPrompt, DELIVERY_TEXTS } from './delivery-agent.prompt';
import { collectAllowedFromToolData, GroundingValidator } from './grounding-validator';

/** Proveedor LLM alternativo (tests/e2e: FakeLlmProvider). Por defecto, Groq vía LlmService. */
export const DELIVERY_LLM_PROVIDER = Symbol('DELIVERY_LLM_PROVIDER');

export const CANDIDATES_TTL_MS = 30 * 60 * 1000;
const HISTORY_LIMIT = 8;

export interface AgentTurnInput {
  ctx: DeliveryTurnContext;
  merchantName: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastCandidates?: ConversationalCandidates | null;
}

export interface AgentTurnOutput {
  text: string;
  toolTrace: Array<{ name: string; ok: boolean }>;
  /** Candidatos de una búsqueda AMBIGUOUS de este turno (para `lastCandidates`, RN-02). */
  candidates: VariantCandidate[] | null;
  fallbackUsed: string | null;
  groundingFailures: number;
}

/** Candidatos vigentes (TTL 30 min). Solo sirven para resolver referencias, nunca para precios. */
export function freshCandidateIds(
  c: ConversationalCandidates | null | undefined,
  now: Date,
): string[] {
  if (!c?.items?.length) return [];
  const age = now.getTime() - new Date(c.createdAt).getTime();
  return age >= 0 && age <= CANDIDATES_TTL_MS ? c.items.map((i) => i.variantId) : [];
}

/**
 * DeliveryAgentService (S2.3-T1/T2): un turno conversacional con tool calling.
 * - Herramientas: catálogo, negocio y carrito (todas leen la BD en el turno, RN-00).
 * - RN-02: `seenVariantIds` = ids de `buscar_producto` del turno + `lastCandidates` vigentes.
 * - RN-28: GroundingValidator sobre el texto final; 1 reintento; luego respaldo del presenter.
 * - Fallback determinista ante fallo del LLM (AC-07): parser + matcher + carrito.
 */
@Injectable()
export class DeliveryAgentService {
  private readonly logger = new Logger(DeliveryAgentService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly catalogTools: CatalogTools,
    private readonly businessInfo: BusinessInfoTool,
    private readonly cartTools: CartTools,
    private readonly matcher: CatalogMatcherService,
    private readonly grounding: GroundingValidator,
    private readonly deliveryTools: DeliveryTools,
    private readonly paymentTools: PaymentTools,
    private readonly confirmTools: ConfirmTools,
    private readonly openingHours: OpeningHoursGuard,
    @Optional() @Inject(DELIVERY_LLM_PROVIDER) private readonly providerOverride?: LlmProvider,
  ) {}

  async handleTurn(input: AgentTurnInput): Promise<AgentTurnOutput> {
    const { ctx } = input;
    freshCandidateIds(input.lastCandidates, ctx.now).forEach((id) => ctx.seenVariantIds.add(id));

    const toolData: unknown[] = [];
    const presented: string[] = [];
    let candidates: VariantCandidate[] | null = null;
    let summaryBlock: string | null = null;
    const handlers = this.instrument(this.allHandlers(), (name, result) => {
      if (!result.ok || result.data === undefined) return;
      toolData.push(result.data);
      const data = result.data as { text?: unknown; status?: unknown; candidates?: unknown };
      if (typeof data.text === 'string') presented.push(data.text);
      if (name === 'resumen_pedido' && typeof data.text === 'string') summaryBlock = data.text;
      if (
        name === 'buscar_producto' &&
        data.status === 'AMBIGUOUS' &&
        Array.isArray(data.candidates)
      ) {
        candidates = (data.candidates as VariantCandidate[]).slice(0, 5);
      }
    });

    const request: LlmToolRequest = {
      systemPrompt: buildDeliverySystemPrompt({
        merchantName: input.merchantName,
        assistantName: ctx.config.assistantName,
        toneHints: ctx.config.toneHints,
      }),
      messages: [...input.history.slice(-HISTORY_LIMIT), { role: 'user', content: ctx.text }],
      tools: this.allDefinitions(),
    };

    const loop = await this.llm.runToolLoop({
      request,
      handlers,
      ctx,
      provider: this.providerOverride ?? undefined,
    });

    if (loop.fallbackReason || !loop.finalText) {
      const text = await this.deterministicFallback(ctx, handlers);
      return this.done(ctx, {
        text,
        toolTrace: loop.toolTrace,
        candidates,
        fallbackUsed: loop.fallbackReason ?? 'EMPTY',
        groundingFailures: 0,
      });
    }

    const allowed = collectAllowedFromToolData(toolData);
    let text = loop.finalText;
    let failures = 0;
    let check = this.grounding.check(text, allowed);
    if (!check.ok) {
      failures++;
      const retry = await this.llm.runToolLoop({
        request: {
          ...request,
          tools: [],
          messages: [
            ...request.messages,
            { role: 'assistant', content: text },
            {
              role: 'user',
              content: `[sistema] Estas cifras no salen de las herramientas: ${check.invalidFigures.join(', ')}. Reescribe la respuesta usando solo cifras devueltas por las herramientas.`,
            },
          ],
        },
        handlers: {},
        ctx,
        maxIterations: 1,
        provider: this.providerOverride ?? undefined,
      });
      if (retry.finalText) {
        check = this.grounding.check(retry.finalText, allowed);
        if (check.ok) text = retry.finalText;
      }
      if (!check.ok) {
        failures++;
        text = presented.length
          ? `Te confirmo lo que tengo anotado:\n${presented[presented.length - 1]}`
          : DELIVERY_TEXTS.retryFallback;
      }
    }
    // RN-12: the pre-confirmation summary is the presenter's exact block, never LLM-written
    if (summaryBlock && !text.includes(summaryBlock)) text = `${text}\n${summaryBlock}`;
    return this.done(ctx, {
      text,
      toolTrace: loop.toolTrace,
      candidates,
      fallbackUsed: failures >= 2 ? 'GROUNDING' : null,
      groundingFailures: failures,
    });
  }

  /** AC-07: sin LLM → parser + matcher; agrega solo coincidencias únicas y muestra el carrito. */
  private async deterministicFallback(
    ctx: DeliveryTurnContext,
    handlers: Record<string, ToolHandler>,
  ): Promise<string> {
    const lines = parseOrderText(ctx.text);
    let lastText: string | null = null;
    for (const line of lines) {
      const match = await this.matcher.search(ctx.merchantId, line.query, 5).catch(() => null);
      if (match?.status !== 'MATCHED') continue;
      ctx.seenVariantIds.add(match.candidate.variantId);
      const res = await handlers.agregar_al_carrito(
        { variantId: match.candidate.variantId, cantidad: line.quantity, notas: line.notes },
        ctx,
      );
      const data = res.data as { text?: unknown } | undefined;
      if (res.ok && typeof data?.text === 'string') lastText = data.text;
    }
    return lastText ? `Te anoté esto:\n${lastText}\n¿Algo más?` : DELIVERY_TEXTS.retryFallback;
  }

  private allDefinitions(): LlmToolDef[] {
    return [
      ...this.catalogTools.definitions,
      ...this.businessInfo.definitions,
      ...this.cartTools.definitions,
      ...this.deliveryTools.definitions,
      ...this.paymentTools.definitions,
      ...this.confirmTools.definitions,
    ];
  }

  /** Todas las herramientas; las que modifican carrito/checkout pasan por el guard de horario (RN-07). */
  private allHandlers(): Record<string, ToolHandler> {
    return this.openingHours.wrap({
      ...this.catalogTools.handlers(),
      ...this.businessInfo.handlers(),
      ...this.cartTools.handlers(),
      ...this.deliveryTools.handlers(),
      ...this.paymentTools.handlers(),
      ...this.confirmTools.handlers(),
    });
  }

  private instrument(
    handlers: Record<string, ToolHandler>,
    onResult: (name: string, result: ToolResult) => void,
  ): Record<string, ToolHandler> {
    return Object.fromEntries(
      Object.entries(handlers).map(([name, handler]) => [
        name,
        async (args: Record<string, unknown>, ctx: DeliveryTurnContext) => {
          const result = await handler(args, ctx);
          onResult(name, result);
          return result;
        },
      ]),
    );
  }

  private done(ctx: DeliveryTurnContext, out: AgentTurnOutput): AgentTurnOutput {
    this.logger.log(
      JSON.stringify({
        event: 'delivery.turn',
        conversationId: ctx.conversationId,
        toolCalls: out.toolTrace,
        fallbackUsed: out.fallbackUsed,
        groundingFailures: out.groundingFailures,
      }),
    );
    return out;
  }
}
