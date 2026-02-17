import { Module } from '@nestjs/common';
import { ConversationSummarizationService } from './conversation-summarization.service';

/**
 * Summarization Module (PR-03.10)
 * Handles conversation summarization jobs
 * Note: ScheduleModule.forRoot() is imported in AppModule
 */
@Module({
  providers: [ConversationSummarizationService],
  exports: [ConversationSummarizationService],
})
export class SummarizationModule {}
