import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConversationSummarizationService } from './conversation-summarization.service';

/**
 * Summarization Module (PR-03.10)
 * Handles periodic conversation summarization jobs
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ConversationSummarizationService],
  exports: [ConversationSummarizationService],
})
export class SummarizationModule {}
