import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import {
  LlmProvider,
  GenerateResponseParams,
  LlmResponse,
  LlmProviderError,
} from '../interfaces/llm-provider.interface';

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

    this.logger.log(`GroqLlmProvider initialized with model: ${this.model}`);
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
    const messages: Array<{ role: string; content: string }> = [
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
