import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import {
  LlmProvider,
  GenerateResponseParams,
  LlmResponse,
  LlmProviderError,
  LlmFailure,
  LlmFailureReason,
} from '../interfaces/llm-provider.interface';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'groq-sdk/resources/chat/completions';
import type {
  LlmToolCall,
  LlmToolRequest,
  LlmToolResponse,
} from '../../verticals/delivery/contracts';

/** S1.3: timeout por defecto de las llamadas del agente (SPEC §3.5). */
export const DEFAULT_TOOL_TIMEOUT_MS = 8000;
const DEFAULT_DELIVERY_MODEL = 'llama-3.3-70b-versatile';

/**
 * Groq LLM Provider implementation
 * Uses Groq SDK to interact with Groq API
 */
@Injectable()
export class GroqLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GroqLlmProvider.name);
  private readonly client: Groq;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly timeoutMs: number;
  private readonly deliveryModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required when LLM_ENABLED=true');
    }

    this.client = new Groq({ apiKey });
    this.model = this.configService.get<string>('LLM_MODEL', 'llama-3.1-70b-versatile');
    this.maxTokens = this.configService.get<number>('LLM_MAX_TOKENS', 500);
    this.temperature = this.configService.get<number>('LLM_TEMPERATURE', 0.7);
    this.timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS', 30000);

    this.deliveryModel = this.configService.get<string>(
      'DELIVERY_LLM_MODEL',
      DEFAULT_DELIVERY_MODEL,
    );

    this.logger.log(`GroqLlmProvider initialized with model: ${this.model}`);
  }

  /**
   * S1.3: tool calling (formato OpenAI). Nunca lanza; sin reintentos.
   */
  async generateWithTools(req: LlmToolRequest): Promise<LlmToolResponse> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m): ChatCompletionMessageParam => {
        if (m.role === 'tool') {
          return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
        }
        if (m.role === 'assistant') {
          return {
            role: 'assistant',
            content: m.content || null,
            ...(m.toolCalls?.length
              ? {
                  tool_calls: m.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                  })),
                }
              : {}),
          };
        }
        return { role: 'user', content: m.content };
      }),
    ];

    const result = await this.callCompletion('tools', req.timeoutMs, (signal) =>
      this.client.chat.completions.create(
        {
          model: req.model ?? this.deliveryModel,
          messages,
          max_tokens: req.maxTokens ?? Number(this.maxTokens),
          temperature: req.temperature ?? Number(this.temperature),
          stream: false,
          ...(req.tools.length
            ? {
                tools: req.tools.map((t) => ({
                  type: 'function' as const,
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
                tool_choice: 'auto' as const,
              }
            : {}),
        },
        { signal },
      ),
    );
    if (!result.ok) return result;

    const message = result.value.choices?.[0]?.message;
    if (!message) return this.fail('tools', 'INVALID_RESPONSE');

    const toolCalls: LlmToolCall[] = [];
    for (const tc of message.tool_calls ?? []) {
      const args = this.parseObject(tc.function?.arguments);
      if (!args || !tc.function?.name) return this.fail('tools', 'INVALID_RESPONSE');
      toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
    }
    const text = message.content ? message.content : null;
    if (text === null && toolCalls.length === 0) return this.fail('tools', 'INVALID_RESPONSE');

    const usage = result.value.usage;
    return {
      ok: true,
      text,
      toolCalls,
      ...(usage
        ? { usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } }
        : {}),
    };
  }

  /**
   * Ejecuta la llamada con timeout (AbortController + carrera con un temporizador, por si el
   * cliente ignora la señal) y mapea cualquier error a `LlmFailure`. Loguea sin contenido (PII).
   */
  private async callCompletion(
    op: 'tools' | 'json',
    timeoutMs: number | undefined,
    call: (signal: AbortSignal) => Promise<ChatCompletion>,
  ): Promise<{ ok: true; value: ChatCompletion } | LlmFailure> {
    const limit = Number(timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('TIMEOUT');
      }, limit);
    });

    try {
      const pending = call(controller.signal);
      pending.catch(() => undefined); // evita unhandled rejection si gana el timeout
      const outcome = await Promise.race([pending, timeout]);
      if (outcome === 'TIMEOUT') return this.fail(op, 'TIMEOUT', Date.now() - startedAt);
      this.logger.debug(`groq.${op} ok latencyMs=${Date.now() - startedAt}`);
      return { ok: true, value: outcome };
    } catch (error) {
      return this.fail(op, this.mapError(error), Date.now() - startedAt);
    } finally {
      clearTimeout(timer);
    }
  }

  private mapError(error: unknown): LlmFailureReason {
    const err = error as { name?: string; status?: number; message?: string } | undefined;
    const name = err?.name ?? '';
    if (['AbortError', 'APIUserAbortError', 'APIConnectionTimeoutError'].includes(name)) {
      return 'TIMEOUT';
    }
    // Groq responde 400 `tool_use_failed` cuando el modelo emite un tool call malformado
    if (err?.status === 400 && (err.message ?? '').includes('tool_use_failed')) {
      return 'INVALID_RESPONSE';
    }
    return 'PROVIDER_ERROR';
  }

  private fail(op: 'tools' | 'json', reason: LlmFailureReason, latencyMs?: number): LlmFailure {
    this.logger.warn(
      `groq.${op} failed reason=${reason}${latencyMs !== undefined ? ` latencyMs=${latencyMs}` : ''}`,
    );
    return { ok: false, reason };
  }

  /** JSON.parse seguro: solo acepta objetos planos. Cadena vacía/ausente → `{}`. */
  private parseObject(raw: string | undefined): Record<string, unknown> | null {
    if (!raw || raw.trim() === '') return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Generate response using Groq API with retry logic
   */
  async generateResponse(params: GenerateResponseParams): Promise<LlmResponse> {
    const maxRetries = 3;
    const delays = [1000, 2000, 4000]; // exponential backoff

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.makeRequest(params);
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        const isRetryable = this.isRetryableError(error);

        if (isLastAttempt || !isRetryable) {
          this.logger.error(
            `Groq API call failed after ${attempt + 1} attempts`,
            error instanceof Error ? error.stack : error,
          );
          throw new LlmProviderError(
            `Groq API failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'groq',
            error,
          );
        }

        const delay = delays[attempt];
        this.logger.warn(
          `Groq API call failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new LlmProviderError('Unexpected retry loop exit', 'groq');
  }

  /**
   * Make actual API request to Groq
   */
  private async makeRequest(params: GenerateResponseParams): Promise<LlmResponse> {
    const startTime = Date.now();

    // Build messages array
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: params.systemPrompt },
    ];

    // Add conversation history if provided
    if (params.conversationHistory && params.conversationHistory.length > 0) {
      // Limit history to last 10 messages to avoid token overflow
      const recentHistory = params.conversationHistory.slice(-10);
      messages.push(...recentHistory.map((msg) => ({ role: msg.role, content: msg.content })));
    }

    // Add current user message
    messages.push({ role: 'user', content: params.userMessage });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          max_tokens: params.maxTokens ?? this.maxTokens,
          temperature: params.temperature ?? this.temperature,
          top_p: 1,
          stream: false,
        },
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      const content = completion.choices[0]?.message?.content || '';

      if (!content || content.length === 0) {
        throw new Error('Empty response from Groq API');
      }

      this.logger.debug(
        `Groq API call successful (${duration}ms, ${completion.usage?.total_tokens || 0} tokens)`,
      );

      return {
        content,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
        model: completion.model,
        finishReason: completion.choices[0]?.finish_reason,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Groq API timeout after ${this.timeoutMs}ms`);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable (rate limit, network, etc.)
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // Retryable conditions
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('503') ||
      message.includes('502')
    );
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
