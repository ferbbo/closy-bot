/**
 * LLM Provider interface - abstraction for LLM API calls
 * Allows swapping between Groq, OpenAI, Anthropic, etc.
 */

export interface LlmProvider {
  /**
   * Generate conversational response using LLM
   * @param params - Generation parameters
   * @returns LLM response with content and metadata
   */
  generateResponse(params: GenerateResponseParams): Promise<LlmResponse>;
}

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
  industry?: 'ropa' | 'belleza' | 'minimarket';
  /** Playbook configuration (future: full playbook) */
  playbook?: PlaybookConfig;
  /** Current cart summary */
  currentCart?: CartSummary;
  /** Available products matching search */
  availableProducts?: ProductSummary[];
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
