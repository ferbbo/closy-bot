/**
 * PlaybookService Unit Tests (PR-11)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PlaybookService } from './playbook.service';
import { GenericPlaybookDefaults } from '../domain/entities/playbook-defaults/generic.config';
import { RopaPlaybookDefaults } from '../domain/entities/playbook-defaults/ropa.config';

describe('PlaybookService', () => {
  let service: PlaybookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaybookService],
    }).compile();

    service = module.get<PlaybookService>(PlaybookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlaybookForMerchant', () => {
    it('should return ropa playbook for ropa merchant', () => {
      const merchant = {
        id: 'test-1',
        name: 'Test Store',
        industry: 'ropa' as const,
      };

      const playbook = service.getPlaybookForMerchant(merchant);

      expect(playbook.industry).toBe('ropa');
      expect(playbook.rules.askSizeBeforeCart).toBe(true);
      expect(playbook.llmPrompt.emojiUsage).toBe('frequent');
    });

    it('should return belleza playbook for belleza merchant', () => {
      const merchant = {
        id: 'test-2',
        name: 'Beauty Store',
        industry: 'belleza' as const,
      };

      const playbook = service.getPlaybookForMerchant(merchant);

      expect(playbook.industry).toBe('belleza');
      expect(playbook.rules.askSkinTypeOnSearch).toBe(true);
      expect(playbook.llmPrompt.emojiUsage).toBe('moderate');
    });

    it('should return minimarket playbook for minimarket merchant', () => {
      const merchant = {
        id: 'test-3',
        name: 'Minimarket',
        industry: 'minimarket' as const,
      };

      const playbook = service.getPlaybookForMerchant(merchant);

      expect(playbook.industry).toBe('minimarket');
      expect(playbook.rules.autoSubstitutions).toBe(true);
      expect(playbook.rules.maxRecommendations).toBe(5);
    });

    it('should return generic playbook when industry is null', () => {
      const merchant = {
        id: 'test-4',
        name: 'Generic Store',
        industry: null,
      };

      const playbook = service.getPlaybookForMerchant(merchant);

      expect(playbook).toBeDefined();
      expect(playbook.llmPrompt.emojiUsage).toBe('moderate');
    });

    it('AC-04: getIndustryDefaults(retail_general) should return GenericPlaybookDefaults', () => {
      const merchant = {
        id: 'test-retail',
        name: 'Retail Store',
        industry: 'retail_general' as const,
      };

      const playbook = service.getPlaybookForMerchant(merchant);

      expect(playbook).toBeDefined();
      expect(playbook.industry).toBe('retail_general');
      expect(playbook.llmPrompt.emojiUsage).toBe('moderate');
      expect(playbook.messages.greeting).toBeDefined();
    });

    it('AC-04: getIndustryDefaults(null) should return GenericPlaybookDefaults (backward compat)', () => {
      const merchant = { id: 'test-null', name: 'Store', industry: null };
      const playbook = service.getPlaybookForMerchant(merchant);
      expect(playbook.industry).toBe('retail_general');
    });

    it('AC-04: getIndustryDefaults(undefined) should return GenericPlaybookDefaults', () => {
      const merchant = { id: 'test-undef', name: 'Store', industry: undefined };
      const playbook = service.getPlaybookForMerchant(merchant);
      expect(playbook.industry).toBe('retail_general');
    });

    it('should merge custom playbook config with defaults', () => {
      const merchant = {
        id: 'test-5',
        name: 'Custom Store',
        industry: 'ropa' as const,
        playbookConfig: {
          rules: {
            maxRecommendations: 10,
          },
        },
      };

      const playbook = service.getPlaybookForMerchant(merchant);

      expect(playbook.rules.maxRecommendations).toBe(10);
      expect(playbook.rules.askSizeBeforeCart).toBe(true); // Inherited from ropa
    });
  });

  describe('getLlmPromptForMerchant', () => {
    it('should build LLM prompt for ropa merchant', () => {
      const merchant = {
        id: 'test-6',
        name: 'Ropa Store',
        industry: 'ropa' as const,
      };

      const prompt = service.getLlmPromptForMerchant(merchant);

      expect(prompt).toContain('Industria:** ropa');
      expect(prompt).toContain('talla');
      expect(prompt).toContain('emojis:** frequent');
    });

    it('should include belleza safety guardrails', () => {
      const merchant = {
        id: 'test-7',
        name: 'Beauty Store',
        industry: 'belleza' as const,
      };

      const prompt = service.getLlmPromptForMerchant(merchant);

      expect(prompt).toContain('NUNCA dar consejos médicos');
      expect(prompt).toContain('NO diagnosticar problemas de piel');
    });
  });

  describe('getGreetingMessage', () => {
    it('should interpolate merchant name in greeting for ropa', () => {
      const merchant = {
        id: 'test-8',
        name: 'Fashion Store',
        industry: 'ropa' as const,
      };

      const greeting = service.getGreetingMessage(merchant);

      expect(greeting).toContain('Fashion Store');
      expect(greeting).toContain('👗');
      expect(greeting).toContain('estilo');
    });

    it('should interpolate merchant name in greeting for belleza', () => {
      const merchant = {
        id: 'test-9',
        name: 'Beauty Corner',
        industry: 'belleza' as const,
      };

      const greeting = service.getGreetingMessage(merchant);

      expect(greeting).toContain('Beauty Corner');
      expect(greeting).toContain('✨');
      expect(greeting).toContain('belleza');
    });

    it('should interpolate merchant name in greeting for minimarket', () => {
      const merchant = {
        id: 'test-10',
        name: 'Express Market',
        industry: 'minimarket' as const,
      };

      const greeting = service.getGreetingMessage(merchant);

      expect(greeting).toContain('Express Market');
      expect(greeting).toContain('🛒');
      expect(greeting).toContain('hogar');
    });
  });

  describe('validatePlaybookConfig', () => {
    it('should validate complete playbook config', () => {
      const validConfig = {
        industry: 'ropa',
        llmPrompt: {
          tone: 'test',
          focusAreas: [],
          commonQuestions: [],
          upsellStrategy: 'test',
          emojiUsage: 'moderate',
        },
        checkoutQuestions: [],
        messages: {
          greeting: 'test',
          addToCartConfirm: 'test',
          noStock: 'test',
          upsellTemplate: 'test',
          checkoutStart: 'test',
        },
        rules: {
          askSizeBeforeCart: false,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: true,
          maxRecommendations: 3,
        },
      };

      expect(() => service.validatePlaybookConfig(validConfig, true)).not.toThrow();
    });

    it('should reject invalid config when requireComplete=true', () => {
      const invalidConfig = {
        industry: 'ropa',
        // Missing required keys
      };

      expect(() => service.validatePlaybookConfig(invalidConfig, true)).toThrow();
    });

    it('should allow partial config when requireComplete=false', () => {
      const partialConfig = {
        llmPrompt: { tone: 'professional' },
      };

      expect(() => service.validatePlaybookConfig(partialConfig, false)).not.toThrow();
    });

    it('should reject non-object config', () => {
      expect(() => service.validatePlaybookConfig(null, false)).toThrow();
      expect(() => service.validatePlaybookConfig('string', false)).toThrow();
      expect(() => service.validatePlaybookConfig(123, false)).toThrow();
    });

    it('should throw if llmPrompt.focusAreas is not an array', () => {
      const invalidConfig = {
        llmPrompt: {
          focusAreas: 'not-an-array',
        },
      };

      expect(() => service.validatePlaybookConfig(invalidConfig, false)).toThrow(
        'focusAreas must be an array',
      );
    });

    it('should throw if llmPrompt.emojiUsage is invalid', () => {
      const invalidConfig = {
        llmPrompt: {
          emojiUsage: 'invalid',
        },
      };

      expect(() => service.validatePlaybookConfig(invalidConfig, false)).toThrow(
        'emojiUsage must be one of: none, moderate, frequent',
      );
    });

    it('should throw if rules.maxRecommendations is out of range', () => {
      const invalidConfig = {
        rules: {
          maxRecommendations: 15,
        },
      };

      expect(() => service.validatePlaybookConfig(invalidConfig, false)).toThrow(
        'maxRecommendations must be a number between 0 and 10',
      );
    });
  });
});

/**
 * PR-GAP-1 AC-02: getMessage(merchant, key, placeholders?) returns correct message
 *                 with placeholder interpolation and GenericPlaybookDefaults fallback.
 */

describe('AC-02: PlaybookService.getMessage() (PR-GAP-1)', () => {
  let service: PlaybookService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const genericMerchant = { id: 'mg-1', name: 'Generic', industry: null, playbookConfig: null };
  const ropaMerchant = {
    id: 'mr-1',
    name: 'Ropa Store',
    industry: 'ropa' as const,
    playbookConfig: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaybookService],
    }).compile();
    service = module.get<PlaybookService>(PlaybookService);
  });

  it('AC-02: returns GenericPlaybookDefaults message for null industry', () => {
    expect(service.getMessage(genericMerchant, 'cartEmpty')).toBe(
      GenericPlaybookDefaults.messages.cartEmpty,
    );
  });

  it('AC-02: returns industry-specific message for Ropa merchant', () => {
    expect(service.getMessage(ropaMerchant, 'cartEmpty')).toBe(
      RopaPlaybookDefaults.messages.cartEmpty,
    );
  });

  it('AC-02: interpolates {placeholder} in template', () => {
    const result = service.getMessage(genericMerchant, 'productNotFound', {
      query: 'camiseta roja',
    });
    expect(result).toContain('camiseta roja');
    expect(result).not.toContain('{query}');
  });

  it('AC-02: interpolates multiple placeholders correctly', () => {
    const result = service.getMessage(genericMerchant, 'updateConfirm', {
      product_name: 'Camiseta',
      variant_name: 'Talla M',
      quantity: 3,
    });
    expect(result).toContain('Camiseta');
    expect(result).toContain('3');
    expect(result).not.toContain('{product_name}');
    expect(result).not.toContain('{quantity}');
  });

  it('AC-02: returns key as last-resort when completely unknown', () => {
    // @ts-expect-error testing invalid key
    expect(service.getMessage(genericMerchant, '__unknown_key__')).toBe('__unknown_key__');
  });

  it('AC-02: safe when called without placeholders argument', () => {
    const result = service.getMessage(genericMerchant, 'helpMenu');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('AC-02: partial playbookConfig override falls back to generic for missing keys', () => {
    const merchant = {
      id: 'mp-1',
      name: 'Partial',
      industry: null,
      playbookConfig: { messages: { greeting: 'Hola!' } },
    };
    const result = service.getMessage(merchant, 'helpMenu');
    expect(result.length).toBeGreaterThan(0);
  });
});

/**
 * PR-GAP-1 AC-06: mergePlaybookConfig supports botPersonality + all new messages fields
 */
describe('AC-06: PlaybookService mergePlaybookConfig — botPersonality + new messages (PR-GAP-1)', () => {
  let service: PlaybookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaybookService],
    }).compile();
    service = module.get<PlaybookService>(PlaybookService);
  });

  it('AC-06: custom cartEmpty message overrides default', () => {
    const merchant = {
      id: 'mc-1',
      name: 'Custom',
      industry: null,
      playbookConfig: { messages: { cartEmpty: 'Mi carrito vacío personalizado.' } },
    };
    expect(service.getMessage(merchant, 'cartEmpty')).toBe('Mi carrito vacío personalizado.');
  });

  it('AC-06: botPersonality from playbookConfig is applied', () => {
    const merchant = {
      id: 'mc-2',
      name: 'Personality',
      industry: null,
      playbookConfig: {
        botPersonality: { style: 'minimal', emojiUsage: 'none', signatureEmoji: '🎯' },
      },
    };
    const playbook = service.getPlaybookForMerchant(merchant);
    expect(playbook.botPersonality?.style).toBe('minimal');
    expect(playbook.botPersonality?.emojiUsage).toBe('none');
    expect(playbook.botPersonality?.signatureEmoji).toBe('🎯');
  });

  it('AC-06: all 15 new PlaybookMessages fields present in GenericPlaybookDefaults', () => {
    const msgs = GenericPlaybookDefaults.messages;
    const requiredNew: (keyof typeof msgs)[] = [
      'searchNoResults',
      'helpMenu',
      'cartEmpty',
      'cartSummaryHeader',
      'cartSummaryFooter',
      'removeConfirm',
      'updateConfirm',
      'quantityInvalid',
      'productNotFound',
      'productMultipleOptions',
      'variantMultipleOptions',
      'itemNotInCart',
      'cartEmptyNoAction',
      'genericError',
      'unknownIntent',
    ];
    for (const key of requiredNew) {
      expect(msgs[key].length).toBeGreaterThan(0);
    }
  });
});
