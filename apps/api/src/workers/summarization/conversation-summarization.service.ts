import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ConversationRepository } from '../../persistence/repositories/conversation.repository';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';
import { LlmService } from '../../llm/llm.service';

/**
 * Conversation Summarization Service (PR-03.10 REQ-04)
 *
 * Periodically updates conversation summary and memory facts using LLM.
 * Runs less frequently than cleanup to control LLM costs.
 *
 * TODO (Phase 2): Full implementation requires:
 * - ConversationRepository.updateMemory() method
 * - LLM summarization prompt
 * - Batch processing of active conversations
 */
@Injectable()
export class ConversationSummarizationService {
  private readonly logger = new Logger(ConversationSummarizationService.name);
  private readonly summaryMaxLength = 1000;
  private readonly batchSize: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly llmService: LlmService,
  ) {
    this.batchSize = this.configService.get<number>('SUMMARIZATION_BATCH_SIZE', 20);
  }

  /**
   * Cron job: Summarize active conversations
   * Runs once per day at 4:00 AM (after cleanup job)
   * AC-04: Job de summarization actualiza summary + memoryFacts periódicamente
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async summarizeConversations() {
    this.logger.log('Starting conversation summarization...');

    try {
      // 1. Find conversations that need summarization (REQ-04, AC-04)
      const minMessagesSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const lastSummarizedBefore = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // > 3 days ago

      const candidates = await this.conversationRepository.findCandidatesForSummarization(
        minMessagesSince,
        lastSummarizedBefore,
        this.batchSize,
      );

      if (candidates.length === 0) {
        this.logger.log('No conversations need summarization');
        return;
      }

      this.logger.log(`Found ${candidates.length} conversation(s) to summarize`);

      // 2. Process each conversation
      let summarizedCount = 0;
      for (const conversation of candidates) {
        try {
          await this.summarizeConversation(conversation.id);
          summarizedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to summarize conversation ${conversation.id}`,
            error instanceof Error ? error.stack : error,
          );
          // Continue with next conversation
        }
      }

      this.logger.log(`Summarization completed: ${summarizedCount}/${candidates.length} succeeded`);
    } catch (error) {
      this.logger.error('Summarization failed', error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Summarize a single conversation (REQ-04, AC-04)
   */
  private async summarizeConversation(conversationId: string): Promise<void> {
    // Get last 20 messages for context
    const logs = await this.messageLogRepository.findLastKByConversation(conversationId, 20);

    if (logs.length === 0) {
      this.logger.debug(`No messages found for conversation ${conversationId}, skipping`);
      return;
    }

    // Build conversation history for LLM
    const history = logs
      .reverse()
      .map((log) => `${log.direction === 'IN' ? 'Usuario' : 'Bot'}: ${log.text || '[media]'}`)
      .join('\n');

    // Call LLM to generate summary and extract facts
    const summaryPrompt = `Resume la siguiente conversación en 1-5 líneas, identificando:
1. Intención principal del cliente
2. Productos/temas mencionados
3. Estado actual (pendiente, resuelto, etc.)
4. Preferencias o contexto importante

Conversación:
${history}

Formato de respuesta:
RESUMEN: [1-5 líneas]
INTENCION: [clasificación]
FACTS: [JSON con facts clave, ej: {"talla":"M","color_preferido":"azul"}]`;

    const llmResponse = await this.llmService.generateConversationalResponse({
      userMessage: summaryPrompt,
      merchantId: 'system', // System-level summarization
    });

    // Parse response (simple extraction)
    const summaryMatch = llmResponse.match(/RESUMEN:\s*(.+?)(?=\nINTENCION:|$)/s);
    const intentMatch = llmResponse.match(/INTENCION:\s*(.+?)(?=\nFACTS:|$)/s);
    const factsMatch = llmResponse.match(/FACTS:\s*(\{[^}]+\})/s);

    const summary =
      summaryMatch?.[1]?.trim().slice(0, this.summaryMaxLength) || 'Resumen no disponible';
    const lastIntent = intentMatch?.[1]?.trim() || 'unknown';
    let memoryFacts: Record<string, unknown> = {};

    if (factsMatch?.[1]) {
      try {
        memoryFacts = JSON.parse(factsMatch[1]);
      } catch {
        this.logger.warn(
          `Failed to parse facts JSON for conversation ${conversationId}, using empty object`,
        );
      }
    }

    // Update conversation memory
    await this.conversationRepository.updateMemory(conversationId, {
      summary,
      memoryFacts,
      lastIntent,
      lastSummarizedAt: new Date(),
    });

    this.logger.debug(
      `Conversation ${conversationId} summarized: intent=${lastIntent}, facts=${Object.keys(memoryFacts).length}`,
    );
  }

  /**
   * Manual trigger for summarization (useful for testing)
   */
  async triggerSummarization(): Promise<{ summarizedCount: number }> {
    this.logger.log('Manual summarization triggered');
    await this.summarizeConversations();
    // Return placeholder (actual count is logged above)
    return { summarizedCount: 0 };
  }
}
