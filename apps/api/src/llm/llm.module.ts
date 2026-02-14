import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { GroqLlmProvider } from './providers/groq-llm.provider';
import { PlaybookService } from '../services/playbook.service';

/**
 * LLM Module - provides LLM services and providers
 * PR-11: Added PlaybookService for industry-specific prompts
 */
@Module({
  imports: [ConfigModule],
  providers: [GroqLlmProvider, PlaybookService, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
