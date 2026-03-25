/**
 * PlaybookService (PR-11 / PR-GAP-1)
 * Handles playbook selection, composition, and validation
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  PlaybookConfig,
  PlaybookMessages,
  BotPersonality,
  Industry,
} from '../domain/entities/playbook-config.interface';
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
   * PR-GAP-1 — REQ-02 / AC-02
   * Get a playbook message by key with simple {placeholder} interpolation.
   * Falls back to GenericPlaybookDefaults when key is missing from merchant playbook.
   *
   * @param merchant  - Merchant data (used to resolve playbook)
   * @param key       - Message key (keyof PlaybookMessages)
   * @param placeholders - Optional map of placeholder → value
   * @returns Interpolated string
   */
  getMessage(
    merchant: MerchantPlaybookData,
    key: keyof PlaybookMessages,
    placeholders?: Record<string, string | number>,
  ): string {
    const playbook = this.getPlaybookForMerchant(merchant);
    let template: string | undefined = playbook.messages[key];

    // Fallback to generic defaults when key is absent (backward compat)
    if (template === undefined) {
      this.logger.warn(
        `getMessage: key "${key}" not found in playbook for merchant ${merchant.id}, using generic default`,
      );
      template = GenericPlaybookDefaults.messages[key];
    }

    // Last-resort: return key name so the bot is never silent
    if (template === undefined) {
      this.logger.error(`getMessage: key "${key}" not found in GenericPlaybookDefaults`);
      return key;
    }

    return this.interpolatePlaceholders(template, placeholders);
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
      case 'retail_general':
        return GenericPlaybookDefaults;
      default:
        this.logger.warn(`Unknown industry: ${industry}, using generic playbook`);
        return GenericPlaybookDefaults;
    }
  }

  /**
   * Merge custom config with base config
   * PUBLIC: used by MerchantSettingsService for PATCH operations
   * Only merges known keys (strips unknown). Does not overwrite with undefined.
   */
  mergePlaybookConfig(
    baseConfig: PlaybookConfig,
    customConfig: Partial<PlaybookConfig>,
  ): PlaybookConfig {
    const result: PlaybookConfig = { ...baseConfig };

    // Only merge keys that are defined (not undefined) to avoid overwriting with undefined
    if (customConfig.industry !== undefined) {
      result.industry = customConfig.industry;
    }

    if (customConfig.llmPrompt !== undefined) {
      result.llmPrompt = { ...baseConfig.llmPrompt };
      const partial = customConfig.llmPrompt;
      if (partial.tone !== undefined) result.llmPrompt.tone = partial.tone;
      if (partial.focusAreas !== undefined) result.llmPrompt.focusAreas = partial.focusAreas;
      if (partial.commonQuestions !== undefined)
        result.llmPrompt.commonQuestions = partial.commonQuestions;
      if (partial.upsellStrategy !== undefined)
        result.llmPrompt.upsellStrategy = partial.upsellStrategy;
      if (partial.emojiUsage !== undefined) result.llmPrompt.emojiUsage = partial.emojiUsage;
    }

    if (customConfig.messages !== undefined) {
      result.messages = { ...baseConfig.messages };
      const partial = customConfig.messages;
      // ── existing fields (PR-11) ──────────────────────────────────────────
      if (partial.greeting !== undefined) result.messages.greeting = partial.greeting;
      if (partial.addToCartConfirm !== undefined)
        result.messages.addToCartConfirm = partial.addToCartConfirm;
      if (partial.noStock !== undefined) result.messages.noStock = partial.noStock;
      if (partial.upsellTemplate !== undefined)
        result.messages.upsellTemplate = partial.upsellTemplate;
      if (partial.checkoutStart !== undefined)
        result.messages.checkoutStart = partial.checkoutStart;
      // ── new fields (PR-GAP-1) ────────────────────────────────────────────
      if (partial.searchNoResults !== undefined)
        result.messages.searchNoResults = partial.searchNoResults;
      if (partial.helpMenu !== undefined) result.messages.helpMenu = partial.helpMenu;
      if (partial.cartEmpty !== undefined) result.messages.cartEmpty = partial.cartEmpty;
      if (partial.cartSummaryHeader !== undefined)
        result.messages.cartSummaryHeader = partial.cartSummaryHeader;
      if (partial.cartSummaryFooter !== undefined)
        result.messages.cartSummaryFooter = partial.cartSummaryFooter;
      if (partial.removeConfirm !== undefined)
        result.messages.removeConfirm = partial.removeConfirm;
      if (partial.updateConfirm !== undefined)
        result.messages.updateConfirm = partial.updateConfirm;
      if (partial.quantityInvalid !== undefined)
        result.messages.quantityInvalid = partial.quantityInvalid;
      if (partial.productNotFound !== undefined)
        result.messages.productNotFound = partial.productNotFound;
      if (partial.productMultipleOptions !== undefined)
        result.messages.productMultipleOptions = partial.productMultipleOptions;
      if (partial.variantMultipleOptions !== undefined)
        result.messages.variantMultipleOptions = partial.variantMultipleOptions;
      if (partial.itemNotInCart !== undefined)
        result.messages.itemNotInCart = partial.itemNotInCart;
      if (partial.cartEmptyNoAction !== undefined)
        result.messages.cartEmptyNoAction = partial.cartEmptyNoAction;
      if (partial.genericError !== undefined) result.messages.genericError = partial.genericError;
      if (partial.unknownIntent !== undefined)
        result.messages.unknownIntent = partial.unknownIntent;
      // ── PR-07: Post-sale messages ──────────────────────────────────────────
      if (partial.orderStatusTemplate !== undefined)
        result.messages.orderStatusTemplate = partial.orderStatusTemplate;
      if (partial.orderStatusPendingPayment !== undefined)
        result.messages.orderStatusPendingPayment = partial.orderStatusPendingPayment;
      if (partial.orderStatusConfirmed !== undefined)
        result.messages.orderStatusConfirmed = partial.orderStatusConfirmed;
      if (partial.orderStatusPaid !== undefined)
        result.messages.orderStatusPaid = partial.orderStatusPaid;
      if (partial.orderStatusShipped !== undefined)
        result.messages.orderStatusShipped = partial.orderStatusShipped;
      if (partial.orderStatusDelivered !== undefined)
        result.messages.orderStatusDelivered = partial.orderStatusDelivered;
      if (partial.orderStatusCancelled !== undefined)
        result.messages.orderStatusCancelled = partial.orderStatusCancelled;
      if (partial.noOrderFound !== undefined) result.messages.noOrderFound = partial.noOrderFound;
      if (partial.ticketTypePrompt !== undefined)
        result.messages.ticketTypePrompt = partial.ticketTypePrompt;
      if (partial.ticketCreatedConfirm !== undefined)
        result.messages.ticketCreatedConfirm = partial.ticketCreatedConfirm;
      if (partial.ticketDescriptionPrompt !== undefined)
        result.messages.ticketDescriptionPrompt = partial.ticketDescriptionPrompt;
    }

    // PR-GAP-1: merge botPersonality
    if (customConfig.botPersonality !== undefined) {
      const base: BotPersonality = baseConfig.botPersonality ?? {
        style: 'friendly',
        emojiUsage: 'moderate',
      };
      result.botPersonality = { ...base };
      const partial = customConfig.botPersonality as Partial<BotPersonality>;
      if (partial.style !== undefined) result.botPersonality.style = partial.style;
      if (partial.emojiUsage !== undefined) result.botPersonality.emojiUsage = partial.emojiUsage;
      if (partial.signatureEmoji !== undefined)
        result.botPersonality.signatureEmoji = partial.signatureEmoji;
    }

    if (customConfig.rules !== undefined) {
      result.rules = { ...baseConfig.rules };
      const partial = customConfig.rules;
      if (partial.askSizeBeforeCart !== undefined)
        result.rules.askSizeBeforeCart = partial.askSizeBeforeCart;
      if (partial.askSkinTypeOnSearch !== undefined)
        result.rules.askSkinTypeOnSearch = partial.askSkinTypeOnSearch;
      if (partial.autoSubstitutions !== undefined)
        result.rules.autoSubstitutions = partial.autoSubstitutions;
      if (partial.upsellEnabled !== undefined) result.rules.upsellEnabled = partial.upsellEnabled;
      if (partial.maxRecommendations !== undefined)
        result.rules.maxRecommendations = partial.maxRecommendations;
    }

    if (customConfig.checkoutQuestions !== undefined) {
      result.checkoutQuestions = customConfig.checkoutQuestions;
    }

    // PR-GAP-2: merge faqs (full replace — merchant overrides entire array)
    if (customConfig.faqs !== undefined) {
      result.faqs = customConfig.faqs;
    }

    return result;
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
   * PR-GAP-1: Simple {placeholder} → value interpolation.
   * Missing placeholders are left as-is (logged as warning).
   */
  private interpolatePlaceholders(
    template: string,
    placeholders?: Record<string, string | number>,
  ): string {
    if (!placeholders) return template;

    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (key in placeholders) {
        return String(placeholders[key] ?? '');
      }
      // Placeholder in template but not in provided values — leave as-is
      this.logger.warn(`interpolatePlaceholders: "{${key}}" has no value in provided placeholders`);
      return match;
    });
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

      // Use !== undefined instead of 'in' to validate only when field is sent (not when undefined via DTO transform)
      if (llmPrompt.focusAreas !== undefined && !Array.isArray(llmPrompt.focusAreas)) {
        throw new BadRequestException('llmPrompt.focusAreas must be an array');
      }

      if (llmPrompt.commonQuestions !== undefined && !Array.isArray(llmPrompt.commonQuestions)) {
        throw new BadRequestException('llmPrompt.commonQuestions must be an array');
      }

      if (
        llmPrompt.emojiUsage !== undefined &&
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
