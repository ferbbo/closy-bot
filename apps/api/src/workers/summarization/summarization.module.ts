import { Module } from '@nestjs/common';
import { ConversationSummarizationService } from './conversation-summarization.service';
import { PersistenceModule } from '../../persistence/persistence.module';
import { LlmModule } from '../../llm/llm.module';

/**
 * Summarization Module (PR-03.10)
 * Handles conversation summarization jobs
 * Note: ScheduleModule.forRoot() is imported in AppModule
 */
@Module({
  imports: [PersistenceModule, LlmModule],
  providers: [ConversationSummarizationService],
  exports: [ConversationSummarizationService],
})
export class SummarizationModule {}
