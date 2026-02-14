/**
 * PlaybookService Unit Tests (PR-11)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlaybookService } from './playbook.service';

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

      expect(service.validatePlaybookConfig(validConfig)).toBe(true);
    });

    it('should reject invalid config', () => {
      const invalidConfig = {
        industry: 'ropa',
        // Missing required keys
      };

      expect(service.validatePlaybookConfig(invalidConfig)).toBe(false);
    });

    it('should reject non-object config', () => {
      expect(service.validatePlaybookConfig(null)).toBe(false);
      expect(service.validatePlaybookConfig('string')).toBe(false);
      expect(service.validatePlaybookConfig(123)).toBe(false);
    });
  });
});
