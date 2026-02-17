import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service for reading memory/retention configuration with merchant-level overrides
 * PR-03.10: REQ-06, AC-06
 *
 * Defaults come from env vars, but can be overridden per merchant via playbookConfig.memory
 */
@Injectable()
export class MemoryConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get message history TTL in days
   * Override path: playbookConfig.memory.messageHistoryDays
   */
  getMessageHistoryDays(merchantPlaybookConfig?: unknown): number {
    const defaultValue = this.configService.get<number>('MESSAGE_HISTORY_DAYS', 30);

    if (merchantPlaybookConfig && typeof merchantPlaybookConfig === 'object') {
      const config = merchantPlaybookConfig as Record<string, unknown>;
      const memory = config.memory as Record<string, unknown> | undefined;

      if (memory && typeof memory.messageHistoryDays === 'number') {
        return memory.messageHistoryDays;
      }
    }

    return defaultValue;
  }

  /**
   * Get max messages per conversation (safety cap)
   * Override path: playbookConfig.memory.messageHistoryMaxPerConvo
   */
  getMessageHistoryMaxPerConvo(merchantPlaybookConfig?: unknown): number {
    const defaultValue = this.configService.get<number>('MESSAGE_HISTORY_MAX_PER_CONVO', 50);

    if (merchantPlaybookConfig && typeof merchantPlaybookConfig === 'object') {
      const config = merchantPlaybookConfig as Record<string, unknown>;
      const memory = config.memory as Record<string, unknown> | undefined;

      if (memory && typeof memory.messageHistoryMaxPerConvo === 'number') {
        return memory.messageHistoryMaxPerConvo;
      }
    }

    return defaultValue;
  }

  /**
   * Get last K messages to include in LLM context
   * Override path: playbookConfig.memory.llmContextLastK
   */
  getLlmContextLastK(merchantPlaybookConfig?: unknown): number {
    const defaultValue = this.configService.get<number>('LLM_CONTEXT_LAST_K', 10);

    if (merchantPlaybookConfig && typeof merchantPlaybookConfig === 'object') {
      const config = merchantPlaybookConfig as Record<string, unknown>;
      const memory = config.memory as Record<string, unknown> | undefined;

      if (memory && typeof memory.llmContextLastK === 'number') {
        return memory.llmContextLastK;
      }
    }

    return defaultValue;
  }
}
