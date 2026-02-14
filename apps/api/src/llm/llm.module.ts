import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { GroqLlmProvider } from './providers/groq-llm.provider';

/**
 * LLM Module - provides LLM services and providers
 */
@Module({
  imports: [ConfigModule],
  providers: [GroqLlmProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
