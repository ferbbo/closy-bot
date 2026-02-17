import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { GroqLlmProvider } from './providers/groq-llm.provider';
import { ServicesModule } from '../services/services.module';
import { PersistenceModule } from '../persistence/persistence.module'; // PR-03.10
import { CommonModule } from '../common/common.module'; // PR-03.10 AC-06

/**
 * LLM Module - provides LLM services and providers
 * PR-11: Imports ServicesModule for PlaybookService (centralized in P2 fix)
 * PR-03.10: Imports PersistenceModule and CommonModule for conversation memory
 */
@Module({
  imports: [ConfigModule, ServicesModule, PersistenceModule, CommonModule],
  providers: [GroqLlmProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
