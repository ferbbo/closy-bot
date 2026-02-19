import { Test, TestingModule } from '@nestjs/testing';
import { MerchantSettingsController } from './merchant-settings.controller';
import { MerchantSettingsService } from './merchant-settings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { Industry } from '@prisma/client';

describe('MerchantSettingsController', () => {
  let controller: MerchantSettingsController;
  let service: jest.Mocked<MerchantSettingsService>;

  const mockMerchantProfile = {
    id: 'merchant-123',
    name: 'Test Store',
    industry: Industry.ropa,
    playbookConfig: null,
  };

  const mockRequest = {
    merchant: { id: 'merchant-123', name: 'Test Store', email: 'test@example.com' },
  } as AuthenticatedRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantSettingsController],
      providers: [
        {
          provide: MerchantSettingsService,
          useValue: {
            getProfile: jest.fn(),
            updateProfile: jest.fn(),
            replacePlaybookConfig: jest.fn(),
            mergePlaybookConfig: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<MerchantSettingsController>(MerchantSettingsController);
    service = module.get(MerchantSettingsService) as jest.Mocked<MerchantSettingsService>;
  });

  describe('getProfile', () => {
    it('should return merchant profile', async () => {
      service.getProfile.mockResolvedValue(mockMerchantProfile);

      const result = await controller.getProfile(mockRequest);

      expect(result).toEqual(mockMerchantProfile);
      expect(service.getProfile).toHaveBeenCalledWith('merchant-123');
    });
  });

  describe('updateProfile', () => {
    it('should update merchant profile', async () => {
      const updateDto = { name: 'New Store Name' };
      const updated = { ...mockMerchantProfile, name: 'New Store Name' };
      service.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result).toEqual(updated);
      expect(service.updateProfile).toHaveBeenCalledWith('merchant-123', updateDto);
    });
  });

  describe('replacePlaybookConfig', () => {
    it('should replace entire playbookConfig', async () => {
      const config = {
        industry: Industry.ropa,
        llmPrompt: {
          tone: 'friendly',
          focusAreas: [],
          commonQuestions: [],
          upsellStrategy: '',
          emojiUsage: 'moderate' as const,
        },
        messages: {
          greeting: 'Hi',
          addToCartConfirm: 'Added',
          noStock: 'Out',
          upsellTemplate: '',
          checkoutStart: 'Start',
        },
        rules: {
          askSizeBeforeCart: true,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: true,
          maxRecommendations: 3,
        },
        checkoutQuestions: [],
      };
      const updated = { ...mockMerchantProfile, playbookConfig: config };
      service.replacePlaybookConfig.mockResolvedValue(updated);

      const result = await controller.replacePlaybookConfig(mockRequest, config);

      expect(result).toEqual(updated);
      expect(service.replacePlaybookConfig).toHaveBeenCalledWith('merchant-123', config);
    });
  });

  describe('mergePlaybookConfig', () => {
    it('should merge partial playbookConfig', async () => {
      const partialConfig = { llmPrompt: { tone: 'professional' } };
      const updated = { ...mockMerchantProfile, playbookConfig: partialConfig };
      service.mergePlaybookConfig.mockResolvedValue(updated as never);

      const result = await controller.mergePlaybookConfig(mockRequest, partialConfig);

      expect(result).toEqual(updated);
      expect(service.mergePlaybookConfig).toHaveBeenCalledWith('merchant-123', partialConfig);
    });
  });
});
