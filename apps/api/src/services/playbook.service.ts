/**
 * PlaybookService (PR-11)
 * Handles playbook selection, composition, and validation
 */

import { Injectable, Logger } from '@nestjs/common';
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
   */
  private mergePlaybookConfig(
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
   * Validate playbook config structure
   */
  validatePlaybookConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }

    const playbook = config as Record<string, unknown>;

    // Basic structure validation
    const requiredKeys = ['industry', 'llmPrompt', 'checkoutQuestions', 'messages', 'rules'];
    return requiredKeys.every((key) => key in playbook);
  }
}
