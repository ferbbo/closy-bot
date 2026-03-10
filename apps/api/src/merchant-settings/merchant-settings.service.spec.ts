import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MerchantSettingsService } from './merchant-settings.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PlaybookService } from '../services/playbook.service';
import { Industry } from '@prisma/client';

describe('MerchantSettingsService', () => {
  let service: MerchantSettingsService;
  let prismaService: jest.Mocked<PrismaService>;
  let playbookService: jest.Mocked<PlaybookService>;

  const mockMerchant = {
    id: 'merchant-123',
    name: 'Test Store',
    industry: Industry.ropa,
    playbookConfig: {
      industry: 'ropa',
      llmPrompt: {
        tone: 'friendly',
        focusAreas: [],
        commonQuestions: [],
        upsellStrategy: '',
        emojiUsage: 'moderate',
      },
      messages: {
        greeting: 'Hello',
        addToCartConfirm: 'Added',
        noStock: 'Out',
        upsellTemplate: '',
        checkoutStart: 'Checkout',
      },
      rules: {
        askSizeBeforeCart: true,
        askSkinTypeOnSearch: false,
        autoSubstitutions: false,
        upsellEnabled: true,
        maxRecommendations: 3,
      },
      checkoutQuestions: [],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantSettingsService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getPlaybookForMerchant: jest.fn(),
            mergePlaybookConfig: jest.fn(),
            validatePlaybookConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MerchantSettingsService>(MerchantSettingsService);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;
    playbookService = module.get(PlaybookService) as jest.Mocked<PlaybookService>;
  });

  describe('getProfile', () => {
    it('should return merchant profile with playbookConfig', async () => {
      prismaService.merchant.findUnique.mockResolvedValue(mockMerchant as never);

      const result = await service.getProfile('merchant-123');

      expect(result).toEqual({
        id: 'merchant-123',
        name: 'Test Store',
        industry: Industry.ropa,
        playbookConfig: mockMerchant.playbookConfig,
      });
      expect(prismaService.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'merchant-123' },
        select: { id: true, name: true, industry: true, playbookConfig: true },
      });
    });

    it('AC-06: should hydrate playbookConfig when null (backward compat)', async () => {
      const merchantWithNullPlaybook = {
        ...mockMerchant,
        playbookConfig: null,
        industry: Industry.ropa,
      };
      const hydratedPlaybook = {
        industry: 'ropa',
        messages: { greeting: 'Hola' },
        llmPrompt: { tone: 'friendly', focusAreas: [], commonQuestions: [], upsellStrategy: '', emojiUsage: 'frequent' as const },
        rules: { askSizeBeforeCart: true, askSkinTypeOnSearch: false, autoSubstitutions: false, upsellEnabled: false, maxRecommendations: 3 },
        checkoutQuestions: [],
      };

      prismaService.merchant.findUnique.mockResolvedValue(merchantWithNullPlaybook as never);
      playbookService.getPlaybookForMerchant.mockReturnValue(hydratedPlaybook as never);

      const result = await service.getProfile('merchant-123');

      expect(result.playbookConfig).toEqual(hydratedPlaybook);
      expect(playbookService.getPlaybookForMerchant).toHaveBeenCalledWith(merchantWithNullPlaybook);
    });

    it('AC-06: should return custom playbookConfig without modification when non-null', async () => {
      prismaService.merchant.findUnique.mockResolvedValue(mockMerchant as never);

      const result = await service.getProfile('merchant-123');

      expect(result.playbookConfig).toEqual(mockMerchant.playbookConfig);
      expect(playbookService.getPlaybookForMerchant).not.toHaveBeenCalled();
    });

    it('AC-06: should treat null industry as retail_general (backward compat)', async () => {
      const merchantWithNullIndustry = {
        ...mockMerchant,
        industry: null,
        playbookConfig: mockMerchant.playbookConfig,
      };

      prismaService.merchant.findUnique.mockResolvedValue(merchantWithNullIndustry as never);

      const result = await service.getProfile('merchant-123');

      expect(result.industry).toBe('retail_general');
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prismaService.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update merchant name', async () => {
      const updated = { ...mockMerchant, name: 'New Store Name' };
      prismaService.merchant.update.mockResolvedValue(updated as never);

      const result = await service.updateProfile('merchant-123', { name: 'New Store Name' });

      expect(result.name).toBe('New Store Name');
      expect(prismaService.merchant.update).toHaveBeenCalledWith({
        where: { id: 'merchant-123' },
        data: { name: 'New Store Name' },
        select: { id: true, name: true, industry: true, playbookConfig: true },
      });
    });

    it('should update merchant industry', async () => {
      const updated = { ...mockMerchant, industry: Industry.belleza };
      prismaService.merchant.update.mockResolvedValue(updated as never);

      const result = await service.updateProfile('merchant-123', { industry: Industry.belleza });

      expect(result.industry).toBe(Industry.belleza);
    });
  });

  describe('replacePlaybookConfig', () => {
    it('should replace entire playbookConfig', async () => {
      const newConfig = {
        industry: Industry.ropa,
        llmPrompt: {
          tone: 'professional',
          focusAreas: ['Size'],
          commonQuestions: [],
          upsellStrategy: '',
          emojiUsage: 'none' as const,
        },
        messages: {
          greeting: 'Hi',
          addToCartConfirm: 'Done',
          noStock: 'Out',
          upsellTemplate: '',
          checkoutStart: 'Start',
        },
        rules: {
          askSizeBeforeCart: true,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: false,
          maxRecommendations: 0,
        },
        checkoutQuestions: [],
      };

      playbookService.validatePlaybookConfig.mockImplementation(() => {}); // No throw
      prismaService.merchant.update.mockResolvedValue({
        ...mockMerchant,
        playbookConfig: newConfig,
      } as never);

      const result = await service.replacePlaybookConfig('merchant-123', newConfig);

      expect(playbookService.validatePlaybookConfig).toHaveBeenCalledWith(newConfig, true);
      expect(result.playbookConfig).toEqual(newConfig);
    });

    it('should throw BadRequestException if config is invalid', async () => {
      const invalidConfig = { industry: Industry.ropa }; // Missing required fields

      playbookService.validatePlaybookConfig.mockImplementation(() => {
        throw new BadRequestException('PlaybookConfig is incomplete');
      });

      await expect(
        service.replacePlaybookConfig('merchant-123', invalidConfig as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('mergePlaybookConfig', () => {
    it('should merge partial playbookConfig with existing config', async () => {
      const partialConfig = {
        llmPrompt: { tone: 'casual' },
      };

      const mergedConfig = {
        ...mockMerchant.playbookConfig,
        llmPrompt: { ...mockMerchant.playbookConfig.llmPrompt, tone: 'casual' },
      };

      prismaService.merchant.findUnique.mockResolvedValue(mockMerchant as never);
      playbookService.getPlaybookForMerchant.mockReturnValue(mockMerchant.playbookConfig as never);
      playbookService.mergePlaybookConfig.mockReturnValue(mergedConfig as never);
      playbookService.validatePlaybookConfig.mockImplementation(() => {}); // No throw
      prismaService.merchant.update.mockResolvedValue({
        ...mockMerchant,
        playbookConfig: mergedConfig,
      } as never);

      const result = await service.mergePlaybookConfig('merchant-123', partialConfig);

      expect(playbookService.getPlaybookForMerchant).toHaveBeenCalledWith(mockMerchant);
      expect(playbookService.mergePlaybookConfig).toHaveBeenCalledWith(
        mockMerchant.playbookConfig,
        partialConfig,
      );
      expect(playbookService.validatePlaybookConfig).toHaveBeenCalledWith(mergedConfig, false);
      expect(result.playbookConfig).toEqual(mergedConfig);
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prismaService.merchant.findUnique.mockResolvedValue(null);

      await expect(service.mergePlaybookConfig('invalid-id', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
