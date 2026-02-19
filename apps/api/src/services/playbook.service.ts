/**
 * PlaybookService (PR-11)
 * Handles playbook selection, composition, and validation
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PlaybookConfig, Industry } from '../domain/entities/playbook-config.interface';
import { RopaPlaybookDefaults } from '../domain/entities/playbook-defaults/ropa.config';
import { BellezaPlaybookDefaults } from '../domain/entities/playbook-defaults/belleza.config';
import { MinimarketPlaybookDefaults } from '../domain/entities/playbook-defaults/minimarket.config';
import { GenericPlaybookDefaults } from '../domain/entities/playbook-defaults/generic.config';

export interface MerchantPlaybookData {
  id: string;
  name: string;
  industry?: Industry | null;
  playbookConfig?: Record<string, unknown> | null;
}

@Injectable()
export class PlaybookService {
  private readonly logger = new Logger(PlaybookService.name);

  /**
   * Get playbook config for a merchant
   * Combines: industry defaults + merchant overrides
   */
  getPlaybookForMerchant(merchant: MerchantPlaybookData): PlaybookConfig {
    const baseConfig = this.getIndustryDefaults(merchant.industry);

    // If merchant has custom overrides, merge them
    if (merchant.playbookConfig) {
      this.logger.debug(`Applying custom playbook config for merchant ${merchant.id}`);
      return this.mergePlaybookConfig(baseConfig, merchant.playbookConfig);
    }

    return baseConfig;
  }

  /**
   * Get LLM prompt config for a merchant
   */
  getLlmPromptForMerchant(merchant: MerchantPlaybookData): string {
    const playbook = this.getPlaybookForMerchant(merchant);
    return this.buildLlmPrompt(playbook);
  }

  /**
   * Get greeting message for a merchant
   */
  getGreetingMessage(merchant: MerchantPlaybookData): string {
    const playbook = this.getPlaybookForMerchant(merchant);
    return this.interpolateMessage(playbook.messages.greeting, merchant.name);
  }

  /**
   * Get industry defaults config
   */
  private getIndustryDefaults(industry?: Industry | null): PlaybookConfig {
    if (!industry) {
      this.logger.debug('No industry set, using generic playbook');
      return GenericPlaybookDefaults;
    }

    switch (industry) {
      case 'ropa':
        return RopaPlaybookDefaults;
      case 'belleza':
        return BellezaPlaybookDefaults;
      case 'minimarket':
        return MinimarketPlaybookDefaults;
      default:
        this.logger.warn(`Unknown industry: ${industry}, using generic playbook`);
        return GenericPlaybookDefaults;
    }
  }

  /**
   * Merge custom config with base config
   * PUBLIC: used by MerchantSettingsService for PATCH operations
   */
  mergePlaybookConfig(
    baseConfig: PlaybookConfig,
    customConfig: Record<string, unknown>,
  ): PlaybookConfig {
    // Deep merge implementation (simple version for MVP)
    // In production, use lodash.merge or similar
    return {
      ...baseConfig,
      ...customConfig,
      llmPrompt: {
        ...baseConfig.llmPrompt,
        ...(customConfig.llmPrompt || {}),
      },
      messages: {
        ...baseConfig.messages,
        ...(customConfig.messages || {}),
      },
      rules: {
        ...baseConfig.rules,
        ...(customConfig.rules || {}),
      },
      checkoutQuestions: customConfig.checkoutQuestions || baseConfig.checkoutQuestions,
    };
  }

  /**
   * Build LLM prompt from playbook config
   */
  private buildLlmPrompt(playbook: PlaybookConfig): string {
    const lines = [
      `**Industria:** ${playbook.industry}`,
      '',
      `**Tono específico:**`,
      playbook.llmPrompt.tone,
      '',
      `**Áreas de enfoque:**`,
      ...playbook.llmPrompt.focusAreas.map((area) => `- ${area}`),
      '',
      `**Preguntas comunes a anticipar:**`,
      ...playbook.llmPrompt.commonQuestions.map((q) => `- "${q}"`),
      '',
      `**Estrategia de venta:**`,
      playbook.llmPrompt.upsellStrategy,
      '',
      `**Uso de emojis:** ${playbook.llmPrompt.emojiUsage}`,
    ];

    // Add special guardrails for belleza
    if (playbook.industry === 'belleza') {
      lines.push(
        '',
        '**IMPORTANTE - Guardrails de belleza:**',
        '- NUNCA dar consejos médicos o dermatológicos',
        '- NO diagnosticar problemas de piel',
        '- NO recomendar productos para tratar condiciones médicas',
        '- Los productos son decorativos/cosméticos, no terapéuticos',
        '- Si pregunta por alergias o reacciones: recomendar consultar profesional',
      );
    }

    return lines.join('\n');
  }

  /**
   * Interpolate message template with merchant data
   */
  private interpolateMessage(template: string, merchantName: string): string {
    return template.replace('{merchant_name}', merchantName);
  }

  /**
   * Validate PlaybookConfig structure (throws BadRequestException if invalid)
   * @param config - Config to validate
   * @param requireComplete - If true, requires all fields (for PUT). If false, allows partial (for PATCH)
   */
  validatePlaybookConfig(config: Partial<PlaybookConfig> | unknown, requireComplete = false): void {
    if (!config || typeof config !== 'object') {
      throw new BadRequestException('PlaybookConfig must be an object');
    }

    const playbook = config as Record<string, unknown>;

    // If requireComplete=true (PUT), check all required top-level keys exist and are not undefined
    if (requireComplete) {
      const requiredKeys = ['industry', 'llmPrompt', 'messages', 'rules', 'checkoutQuestions'];
      const missingKeys = requiredKeys.filter((k) => playbook[k] === undefined);

      if (missingKeys.length > 0) {
        throw new BadRequestException(
          `PlaybookConfig is incomplete. Missing fields: ${missingKeys.join(', ')}`,
        );
      }
    }

    // Validate nested structures if provided
    if (playbook.llmPrompt !== undefined) {
      if (typeof playbook.llmPrompt !== 'object' || playbook.llmPrompt === null) {
        throw new BadRequestException('llmPrompt must be an object');
      }

      const llmPrompt = playbook.llmPrompt as Record<string, unknown>;

      if ('focusAreas' in llmPrompt && !Array.isArray(llmPrompt.focusAreas)) {
        throw new BadRequestException('llmPrompt.focusAreas must be an array');
      }

      if ('commonQuestions' in llmPrompt && !Array.isArray(llmPrompt.commonQuestions)) {
        throw new BadRequestException('llmPrompt.commonQuestions must be an array');
      }

      if (
        'emojiUsage' in llmPrompt &&
        !['none', 'moderate', 'frequent'].includes(llmPrompt.emojiUsage as string)
      ) {
        throw new BadRequestException(
          'llmPrompt.emojiUsage must be one of: none, moderate, frequent',
        );
      }
    }

    if (playbook.messages !== undefined) {
      if (typeof playbook.messages !== 'object' || playbook.messages === null) {
        throw new BadRequestException('messages must be an object');
      }
    }

    if (playbook.rules !== undefined) {
      if (typeof playbook.rules !== 'object' || playbook.rules === null) {
        throw new BadRequestException('rules must be an object');
      }

      const rules = playbook.rules as Record<string, unknown>;

      if ('maxRecommendations' in rules) {
        const max = rules.maxRecommendations;
        if (typeof max !== 'number' || max < 0 || max > 10) {
          throw new BadRequestException(
            'rules.maxRecommendations must be a number between 0 and 10',
          );
        }
      }
    }

    if (playbook.checkoutQuestions !== undefined) {
      if (!Array.isArray(playbook.checkoutQuestions)) {
        throw new BadRequestException('checkoutQuestions must be an array');
      }
    }

    this.logger.debug('PlaybookConfig validation passed');
  }
}
