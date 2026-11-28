/**
 * LLM Provider interface - abstraction for LLM API calls
 * Allows swapping between Groq, OpenAI, Anthropic, etc.
 */
import type { LlmToolRequest, LlmToolResponse } from '../../verticals/delivery/contracts';

export interface LlmProvider {
  /**
   * Generate conversational response using LLM
   * @param params - Generation parameters
   * @returns LLM response with content and metadata
   */
  generateResponse(params: GenerateResponseParams): Promise<LlmResponse>;

  /**
   * S1.3: Tool calling (formato OpenAI). NUNCA lanza: cualquier fallo se devuelve
   * como `{ ok: false, reason }` (TIMEOUT | PROVIDER_ERROR | INVALID_RESPONSE).
   * Timeout por defecto: 8000 ms (SPEC §3.5). Sin reintentos (presupuesto de latencia del turno).
   */
  generateWithTools(req: LlmToolRequest): Promise<LlmToolResponse>;

  /**
   * S1.3: Respuesta JSON (`response_format: json_object`). NUNCA lanza.
   * El valor se devuelve parseado pero SIN validar contra `T`: el llamador valida la forma.
   */
  generateJson<T = unknown>(req: LlmJsonRequest): Promise<LlmJsonResult<T>>;
}

/** S1.3: Razón de fallo común a los métodos que no lanzan (alias de `LlmToolResponse` ok:false). */
export type LlmFailureReason = Extract<LlmToolResponse, { ok: false }>['reason'];
export type LlmFailure = { ok: false; reason: LlmFailureReason };

/** S1.3: Parámetros de `generateJson`. El prompt debe pedir explícitamente JSON (requisito de json_object). */
export interface LlmJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Por defecto `DELIVERY_LLM_MODEL` */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Por defecto 8000 ms */
  timeoutMs?: number;
}

export type LlmJsonResult<T> = { ok: true; value: T } | LlmFailure;

export interface GenerateResponseParams {
  /** System prompt with instructions and guardrails */
  systemPrompt: string;
  /** User's current message */
  userMessage: string;
  /** Conversation history (optional, for context) */
  conversationHistory?: Message[];
  /** Additional context (merchant, cart, products) */
  context?: LlmContext;
  /** Max tokens to generate (default: configured per provider) */
  maxTokens?: number;
  /** Temperature for sampling (0-2, default: 0.7) */
  temperature?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmContext {
  /** Merchant name for personalization */
  merchantName: string;
  /** Industry/vertical (for playbook selection) */
  industry?: 'ropa' | 'belleza' | 'minimarket' | 'retail_general';
  /** Playbook configuration (future: full playbook) */
  playbook?: PlaybookConfig;
  /** Current cart summary */
  currentCart?: CartSummary;
  /** Available products matching search */
  availableProducts?: ProductSummary[];
  /** PR-03.10: Conversation memory (summary + facts + recent history) */
  conversationMemory?: ConversationMemory;
}

/** PR-03.10: Conversation memory structure */
export interface ConversationMemory {
  /** Conversation summary (1-5 lines) */
  summary?: string;
  /** Persistent facts extracted from conversation */
  facts?: Record<string, unknown>;
  /** Last detected intent */
  lastIntent?: string;
  /** Recent message history (last K messages) */
  recentHistory?: Array<{
    direction: 'IN' | 'OUT';
    text?: string;
    timestamp: Date;
  }>;
}

export interface PlaybookConfig {
  /** Playbook name/ID */
  name: string;
  /** Tone/personality override */
  tone?: string;
  /** Custom guidelines */
  customGuidelines?: string[];
}

export interface CartSummary {
  /** Number of items in cart */
  itemCount: number;
  /** Total value (formatted) */
  total: string;
  /** Brief list of items */
  items: string[];
}

export interface ProductSummary {
  /** Product SKU or ID */
  sku: string;
  /** Product name */
  name: string;
  /** Price (formatted) */
  price: string;
  /** Stock status */
  inStock: boolean;
}

export interface LlmResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics (if available) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Model used for generation */
  model: string;
  /** Reason for completion (stop, length, etc.) */
  finishReason?: string;
}

/**
 * Custom error for LLM provider failures
 */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
