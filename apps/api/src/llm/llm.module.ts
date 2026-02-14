import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { GroqLlmProvider } from './providers/groq-llm.provider';
import { ServicesModule } from '../services/services.module';

/**
 * LLM Module - provides LLM services and providers
 * PR-11: Imports ServicesModule for PlaybookService (centralized in P2 fix)
 */
@Module({
  imports: [ConfigModule, ServicesModule],
  providers: [GroqLlmProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
