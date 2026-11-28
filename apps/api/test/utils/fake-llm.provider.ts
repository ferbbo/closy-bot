/**
 * FakeLlmProvider — LLM con guion para unit y e2e (S1.3-T2). Nunca llama a Groq.
 *
 * Uso:
 *   const llm = new FakeLlmProvider([
 *     { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
 *     { text: 'Listo' },
 *   ]);
 *   ...
 *   expect(llm.calls[1].request).toMatchObject({ messages: expect.arrayContaining([...]) });
 *
 * - Los pasos se consumen en orden, compartidos entre `generateWithTools`, `generateJson`
 *   y `generateResponse` (un paso por llamada).
 * - `calls` registra una copia profunda de cada request recibida (el llamador puede mutar las suyas).
 * - Guion agotado: por defecto devuelve `{ ok: false, reason: 'INVALID_RESPONSE' }` (respeta el
 *   contrato "nunca lanza") e incrementa `exhaustedCalls`; con `{ strict: true }` lanza un Error
 *   claro para detectar llamadas de más. `generateResponse` (API legacy, sí lanza) siempre lanza.
 *
 * Importable desde specs unit en src (ruta relativa a `apps/api/test/utils/fake-llm.provider`)
 * y desde e2e.
 */
import type {
  LlmToolCall,
  LlmToolRequest,
  LlmToolResponse,
} from '../../src/verticals/delivery/contracts';
import {
  LlmProviderError,
  type GenerateResponseParams,
  type LlmFailureReason,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
  type LlmResponse,
} from '../../src/llm/interfaces/llm-provider.interface';

export type FakeToolCall = Omit<LlmToolCall, 'id'> & { id?: string };

export type FakeLlmStep =
  | { toolCalls: FakeToolCall[]; text?: string }
  | { text: string }
  | { json: unknown }
  | { failure: LlmFailureReason };

export type FakeLlmCall =
  | { method: 'generateWithTools'; request: LlmToolRequest }
  | { method: 'generateJson'; request: LlmJsonRequest }
  | { method: 'generateResponse'; request: GenerateResponseParams };

export interface FakeLlmOptions {
  /** true ⇒ lanza un Error cuando el guion se agota (por defecto devuelve INVALID_RESPONSE). */
  strict?: boolean;
}

export class FakeLlmProvider implements LlmProvider {
  readonly calls: FakeLlmCall[] = [];
  exhaustedCalls = 0;
  private readonly steps: FakeLlmStep[];
  private cursor = 0;
  private idSeq = 0;

  constructor(
    steps: FakeLlmStep[] = [],
    private readonly options: FakeLlmOptions = {},
  ) {
    this.steps = [...steps];
  }

  /** Agrega pasos al final del guion. */
  enqueue(...steps: FakeLlmStep[]): this {
    this.steps.push(...steps);
    return this;
  }

  /** Pasos aún no consumidos. */
  get remaining(): number {
    return this.steps.length - this.cursor;
  }

  async generateWithTools(req: LlmToolRequest): Promise<LlmToolResponse> {
    this.calls.push({ method: 'generateWithTools', request: structuredClone(req) });
    const step = this.next('generateWithTools');
    if (!step) return { ok: false, reason: 'INVALID_RESPONSE' };
    if ('failure' in step) return { ok: false, reason: step.failure };
    if ('toolCalls' in step) {
      return {
        ok: true,
        text: step.text ?? null,
        toolCalls: step.toolCalls.map((tc) => ({
          id: tc.id ?? `fake_call_${++this.idSeq}`,
          name: tc.name,
          arguments: tc.arguments,
        })),
      };
    }
    if ('text' in step) return { ok: true, text: step.text, toolCalls: [] };
    return { ok: true, text: JSON.stringify(step.json), toolCalls: [] };
  }

  async generateJson<T = unknown>(req: LlmJsonRequest): Promise<LlmJsonResult<T>> {
    this.calls.push({ method: 'generateJson', request: structuredClone(req) });
    const step = this.next('generateJson');
    if (!step) return { ok: false, reason: 'INVALID_RESPONSE' };
    if ('failure' in step) return { ok: false, reason: step.failure };
    if ('json' in step) return { ok: true, value: step.json as T };
    if ('toolCalls' in step) return { ok: false, reason: 'INVALID_RESPONSE' };
    try {
      return { ok: true, value: JSON.parse(step.text) as T };
    } catch {
      return { ok: false, reason: 'INVALID_RESPONSE' };
    }
  }

  async generateResponse(params: GenerateResponseParams): Promise<LlmResponse> {
    this.calls.push({ method: 'generateResponse', request: structuredClone(params) });
    const step = this.next('generateResponse');
    if (step && 'text' in step && !('toolCalls' in step)) {
      return { content: step.text, model: 'fake-llm' };
    }
    throw new LlmProviderError(
      `FakeLlmProvider: generateResponse needs a { text } step (got ${step ? JSON.stringify(step) : 'none'})`,
      'fake',
    );
  }

  private next(method: FakeLlmCall['method']): FakeLlmStep | undefined {
    if (this.cursor < this.steps.length) return this.steps[this.cursor++];
    this.exhaustedCalls++;
    if (this.options.strict) {
      throw new Error(
        `FakeLlmProvider: script exhausted on ${method} call #${this.calls.length} ` +
          `(${this.steps.length} step(s) scripted)`,
      );
    }
    return undefined;
  }
}
