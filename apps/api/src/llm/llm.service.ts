import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmContext } from './interfaces/llm-provider.interface';
import { GroqLlmProvider } from './providers/groq-llm.provider';
import { PlaybookPromptBuilder, SystemPromptParams } from './prompts/playbook-prompt-builder';
import { containsSuspiciousPatterns } from './prompts/base-system-prompt';

/**
 * LLM Service - Facade for LLM operations
 * Handles:
 * - LLM provider selection and initialization
 * - System prompt composition
 * - Fallback to templated responses
 * - Guardrails and validation
 */

export interface ConversationContext {
  conversationId: string;
  merchantName: string;
  industry?: 'ropa' | 'belleza' | 'minimarket';
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

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly llmEnabled: boolean;
  private readonly provider?: LlmProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly groqProvider: GroqLlmProvider,
  ) {
    this.llmEnabled = this.configService.get<boolean>('LLM_ENABLED', false);

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
   *
   * @param params - Request parameters
   * @returns Generated response text
   */
  async generateConversationalResponse(params: {
    userMessage: string;
    merchantId: string;
    conversationContext?: ConversationContext;
  }): Promise<string> {
    // If LLM is disabled, use fallback immediately
    if (!this.llmEnabled || !this.provider) {
      return this.getFallbackResponse(params.userMessage);
    }

    try {
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt({
        merchantName: params.conversationContext?.merchantName || 'Tu tienda',
        industry: params.conversationContext?.industry,
        context: this.buildLlmContext(params.conversationContext),
      });

      // Call LLM provider
      const response = await this.provider.generateResponse({
        systemPrompt,
        userMessage: params.userMessage,
        conversationHistory: [], // TODO: CR-03.7 - add history from DB
        context: this.buildLlmContext(params.conversationContext),
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
