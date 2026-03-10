import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmContext } from './interfaces/llm-provider.interface';
import { GroqLlmProvider } from './providers/groq-llm.provider';
import { PlaybookPromptBuilder, type SystemPromptParams } from './prompts/playbook-prompt-builder';
import { containsSuspiciousPatterns } from './prompts/base-system-prompt';
import { PlaybookService, type MerchantPlaybookData } from '../services/playbook.service';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository'; // PR-03.10
import { ConversationRepository } from '../persistence/repositories/conversation.repository'; // PR-03.10
import { MemoryConfigService } from '../common/config/memory-config.service'; // PR-03.10 AC-06

/**
 * LLM Service - Facade for LLM operations
 * Handles:
 * - LLM provider selection and initialization
 * - System prompt composition (with playbook integration - PR-11)
 * - Fallback to templated responses
 * - Guardrails and validation
 * - PR-03.10: Context building with message history + conversation memory
 */

export interface ConversationContext {
  conversationId: string;
  merchantName: string;
  industry?: 'ropa' | 'belleza' | 'minimarket' | 'retail_general';
  currentCart?: {
    itemCount: number;
    total: string;
    items: string[];
  };
  availableProducts?: Array<{
    sku: string;
    name: string;
    price: string;
    inStock: boolean;
  }>;
}

// PR-03.10: Extended context with memory
export interface ConversationMemory {
  summary?: string; // 1-5 lines summary of conversation
  facts?: Record<string, unknown>; // Persistent facts extracted
  lastIntent?: string; // Last detected intent
  recentHistory?: Array<{
    direction: 'IN' | 'OUT';
    text?: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly llmEnabled: boolean;
  private readonly provider?: LlmProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly groqProvider: GroqLlmProvider,
    private readonly playbookService: PlaybookService,
    private readonly messageLogRepository: MessageLogRepository, // PR-03.10
    private readonly conversationRepository: ConversationRepository, // PR-03.10
    private readonly memoryConfigService: MemoryConfigService, // PR-03.10 AC-06
  ) {
    // PR-03.5.1: Check LLM_ENABLED (deprecated) OR any granular flag for backward compat
    const llmEnabledLegacy = this.configService.get<boolean>('LLM_ENABLED', false);
    const llmIntentAssist = this.configService.get<boolean>('LLM_INTENT_ASSIST', false);
    const llmFallbackEnabled = this.configService.get<boolean>('LLM_FALLBACK_ENABLED', false);
    const llmSummaryEnabled = this.configService.get<boolean>('LLM_SUMMARY_ENABLED', false);

    // Enable LLM if legacy flag OR any granular flag is true
    this.llmEnabled =
      llmEnabledLegacy || llmIntentAssist || llmFallbackEnabled || llmSummaryEnabled;

    if (this.llmEnabled) {
      const providerName = this.configService.get<string>('LLM_PROVIDER', 'groq');
      this.provider = this.getProvider(providerName);
      this.logger.log(`LLM enabled with provider: ${providerName}`);
    } else {
      this.logger.log('LLM disabled, using fallback responses');
    }
  }

  /**
   * Generate conversational response using LLM or fallback
   * PR-11: Now uses PlaybookService for prompt composition
   * PR-03.10: Enhanced with conversation memory (history + summary + facts)
   *
   * @param params - Request parameters
   * @returns Generated response text
   */
  async generateConversationalResponse(params: {
    userMessage: string;
    merchantId: string;
    merchant?: MerchantPlaybookData;
    conversationContext?: ConversationContext;
  }): Promise<string> {
    // If LLM is disabled, use fallback immediately
    if (!this.llmEnabled || !this.provider) {
      return this.getFallbackResponse(params.userMessage);
    }

    try {
      // PR-03.10: Build context with memory if conversation context provided
      const contextWithMemory = params.conversationContext
        ? await this.buildContextWithMemory(
            params.conversationContext,
            params.merchant?.playbookConfig,
          )
        : undefined;

      // Build system prompt with playbook integration + memory
      const systemPrompt = this.buildSystemPromptWithPlaybook({
        merchantName: params.conversationContext?.merchantName || 'Tu tienda',
        industry: params.conversationContext?.industry,
        merchant: params.merchant,
        context: contextWithMemory || this.buildLlmContext(params.conversationContext),
      });

      // Call LLM provider
      const response = await this.provider.generateResponse({
        systemPrompt,
        userMessage: params.userMessage,
        conversationHistory: [], // History is now in context
        context: contextWithMemory || this.buildLlmContext(params.conversationContext),
        maxTokens: this.configService.get<number>('LLM_MAX_TOKENS', 500),
        temperature: this.configService.get<number>('LLM_TEMPERATURE', 0.7),
      });

      // Basic post-validation
      if (containsSuspiciousPatterns(response.content)) {
        this.logger.warn('Suspicious patterns detected in LLM response, using fallback');
        return this.getFallbackResponse(params.userMessage);
      }

      this.logger.debug(
        `LLM response generated (${response.usage?.totalTokens || 0} tokens, model: ${response.model})`,
      );

      return response.content;
    } catch (error) {
      this.logger.error(
        'LLM generation failed, using fallback',
        error instanceof Error ? error.stack : error,
      );
      return this.getFallbackResponse(params.userMessage);
    }
  }

  /**
   * PR-03.5.1: Generate simple LLM response with minimal context
   * Used for intent assist (short prompts, low cost, fast timeout)
   *
   * @param prompt - System + user prompt combined
   * @param options - Generation options (maxTokens, temperature, timeout)
   * @returns LLM response text
   * @throws Error if LLM is disabled or generation fails
   */
  async generateSimple(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      timeout?: number;
    },
  ): Promise<string | null> {
    if (!this.llmEnabled || !this.provider) {
      this.logger.debug('LLM disabled, returning null from generateSimple');
      return null;
    }

    try {
      const response = await this.provider.generateResponse({
        systemPrompt: '', // Empty system prompt, all in user message
        userMessage: prompt,
        conversationHistory: [],
        context: undefined,
        maxTokens: options?.maxTokens ?? 100,
        temperature: options?.temperature ?? 0.3,
      });

      return response.content;
    } catch (error) {
      this.logger.error('Simple LLM generation failed', error);
      throw error;
    }
  }

  /**
   * PR-03.10: Build context with conversation memory (REQ-05, AC-05)
   * Combines:
   * - Last K message logs (history)
   * - Conversation summary (if exists)
   * - Memory facts (if exist)
   * - Business state (cart, products, etc.)
   *
   * Guardrail: LLM should NOT invent price/stock/policies/ETA (always from backend)
   */
  async buildContextWithMemory(
    conversationContext: ConversationContext,
    merchantPlaybookConfig?: unknown,
  ): Promise<LlmContext> {
    const baseContext = this.buildLlmContext(conversationContext);

    try {
      // AC-06: Get last K messages with merchant override
      const lastK = this.memoryConfigService.getLlmContextLastK(merchantPlaybookConfig);
      const messageLogs = await this.messageLogRepository.findLastKByConversation(
        conversationContext.conversationId,
        lastK,
      );

      // Map to simple format (no PII logging)
      const recentHistory = messageLogs.reverse().map((log) => ({
        direction: log.direction as 'IN' | 'OUT',
        text: log.text ?? undefined,
        timestamp: log.createdAt,
      }));

      // PR-03.10: Fetch summary and facts from Conversation (REQ-05, AC-05)
      const conversation = await this.conversationRepository.findById(
        conversationContext.conversationId,
      );

      return {
        ...(baseContext as LlmContext),
        conversationMemory: {
          recentHistory,
          summary: conversation?.summary ?? undefined,
          facts: (conversation?.memoryFacts as Record<string, unknown>) ?? undefined,
          lastIntent: conversation?.lastIntent ?? undefined,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to build context with memory for conversation ${conversationContext.conversationId}, using base context`,
        error,
      );
      return baseContext as LlmContext;
    }
  }

  /**
   * Build system prompt with playbook integration (PR-11)
   */
  private buildSystemPromptWithPlaybook(params: {
    merchantName: string;
    industry?: 'ropa' | 'belleza' | 'minimarket' | 'retail_general';
    merchant?: MerchantPlaybookData;
    context?: LlmContext;
  }): string {
    // If we have full merchant data, use PlaybookService
    if (params.merchant) {
      const playbookPrompt = this.playbookService.getLlmPromptForMerchant(params.merchant);
      return PlaybookPromptBuilder.build({
        merchantName: params.merchantName,
        industry: params.industry,
        context: params.context,
        playbookPrompt, // Inject playbook prompt
      });
    }

    // Fallback to simple composition
    return PlaybookPromptBuilder.build({
      merchantName: params.merchantName,
      industry: params.industry,
      context: params.context,
    });
  }

  /**
   * Build complete system prompt with all layers
   */
  buildSystemPrompt(params: SystemPromptParams): string {
    return PlaybookPromptBuilder.build(params);
  }

  /**
   * Get LLM provider by name
   */
  private getProvider(providerName: string): LlmProvider {
    switch (providerName.toLowerCase()) {
      case 'groq':
        return this.groqProvider;
      // Future: add other providers (OpenAI, Anthropic)
      default:
        throw new Error(`Unknown LLM provider: ${providerName}`);
    }
  }

  /**
   * Build LlmContext from ConversationContext
   */
  private buildLlmContext(context?: ConversationContext): LlmContext | undefined {
    if (!context) return undefined;

    return {
      merchantName: context.merchantName,
      industry: context.industry,
      currentCart: context.currentCart,
      availableProducts: context.availableProducts,
    };
  }

  /**
   * Fallback response when LLM is disabled or fails
   * Returns generic templated response
   */
  private getFallbackResponse(userMessage: string): string {
    // Basic keyword matching for fallback
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hola') || lowerMessage.includes('buenos')) {
      return '¡Hola! 👋 ¿En qué puedo ayudarte hoy?';
    }

    if (
      lowerMessage.includes('ayuda') ||
      lowerMessage.includes('info') ||
      lowerMessage.includes('información')
    ) {
      return 'Puedo ayudarte a:\n• Buscar productos\n• Agregar al carrito\n• Realizar tu pedido\n\n¿Qué te gustaría hacer?';
    }

    // Generic fallback
    return 'Entendido. ¿Puedes darme más detalles para ayudarte mejor? O escribe "ayuda" para ver las opciones disponibles.';
  }
}
