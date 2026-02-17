import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
// import { ConversationRepository } from '../../persistence/repositories/conversation.repository';
// import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';
// import { LlmService } from '../../llm/llm.service';

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

  constructor(
    private readonly configService: ConfigService,
    // private readonly conversationRepository: ConversationRepository,
    // private readonly messageLogRepository: MessageLogRepository,
    // private readonly llmService: LlmService,
  ) {}

  /**
   * Cron job: Summarize active conversations
   * Runs once per day at 4:00 AM (after cleanup job)
   * AC-04: Job de summarization actualiza summary + memoryFacts periódicamente
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async summarizeConversations() {
    this.logger.log('Starting conversation summarization...');

    try {
      // TODO Phase 2: Implement full summarization logic
      // 1. Find active conversations (status='active', lastMessageAt > X days)
      // 2. For each conversation:
      //    a. Get recent messages from MessageLog
      //    b. Call LLM to generate summary (1-5 lines)
      //    c. Extract key facts (preferences, context, issues)
      //    d. Update Conversation.summary, memoryFacts, lastSummarizedAt
      // 3. Batch process to control LLM costs

      this.logger.warn('Summarization not fully implemented yet (stub for PR-03.10)');
      this.logger.log('Summarization completed (stub)');
    } catch (error) {
      this.logger.error('Summarization failed', error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Manual trigger for summarization (useful for testing)
   */
  async triggerSummarization(): Promise<{ summarizedCount: number }> {
    this.logger.log('Manual summarization triggered');
    // TODO: implement
    return { summarizedCount: 0 };
  }
}
