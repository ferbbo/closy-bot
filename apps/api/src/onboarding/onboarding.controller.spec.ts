/**
 * PR-OB-01: OnboardingController Unit Tests
 *
 * AC-01: GET /onboarding/progress → delega a service.getProgress()
 * AC-04: POST /onboarding/apply-preset → delega a service.applyPreset()
 * AC-06: POST /onboarding/activate → delega a service.activate()
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MerchantStatus } from '@prisma/client';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';

const MERCHANT_ID = 'merchant-test-1';

const mockMerchant = {
  id: MERCHANT_ID,
  name: 'Test Store',
  status: MerchantStatus.onboarding,
} as AuthenticatedRequest['merchant'];

const mockRequest = {
  merchant: mockMerchant,
} as AuthenticatedRequest;

const mockOnboardingService = {
  getProgress: jest.fn(),
  applyPreset: jest.fn(),
  activate: jest.fn(),
};

// Override SessionAuthGuard to always allow in unit tests
const mockGuard = {
  canActivate: jest.fn((context: import('@nestjs/common').ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    req.merchant = mockMerchant;
    return true;
  }),
};

describe('OnboardingController', () => {
  let controller: OnboardingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        {
          provide: OnboardingService,
          useValue: mockOnboardingService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ────────────────────────────────────────────────────────────────────────
  // AC-01: GET /onboarding/progress
  // ────────────────────────────────────────────────────────────────────────

  describe('AC-01: GET /onboarding/progress', () => {
    it('should call onboardingService.getProgress with merchantId', async () => {
      const progressResponse = {
        completedSteps: ['profile'],
        pendingSteps: ['channel', 'catalog', 'config', 'test'],
        percentage: 20,
        nextStep: 'channel',
      };
      mockOnboardingService.getProgress.mockResolvedValue(progressResponse);

      const result = await controller.getProgress(mockRequest);

      expect(mockOnboardingService.getProgress).toHaveBeenCalledWith(MERCHANT_ID);
      expect(result).toEqual(progressResponse);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // AC-04, AC-05: POST /onboarding/apply-preset
  // ────────────────────────────────────────────────────────────────────────

  describe('AC-04: POST /onboarding/apply-preset', () => {
    it('should call onboardingService.applyPreset with merchantId and dto', async () => {
      mockOnboardingService.applyPreset.mockResolvedValue({ success: true });

      const dto = { industry: 'ropa' as const };
      const result = await controller.applyPreset(mockRequest, dto);

      expect(mockOnboardingService.applyPreset).toHaveBeenCalledWith(MERCHANT_ID, dto);
      expect(result).toEqual({ success: true });
    });

    it('should call applyPreset with different industries', async () => {
      mockOnboardingService.applyPreset.mockResolvedValue({ success: true });

      await controller.applyPreset(mockRequest, { industry: 'belleza' });
      expect(mockOnboardingService.applyPreset).toHaveBeenCalledWith(MERCHANT_ID, {
        industry: 'belleza',
      });

      await controller.applyPreset(mockRequest, { industry: 'minimarket' });
      expect(mockOnboardingService.applyPreset).toHaveBeenCalledWith(MERCHANT_ID, {
        industry: 'minimarket',
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // AC-06, AC-07: POST /onboarding/activate
  // ────────────────────────────────────────────────────────────────────────

  describe('AC-06: POST /onboarding/activate', () => {
    it('should call onboardingService.activate with merchantId', async () => {
      mockOnboardingService.activate.mockResolvedValue({ activated: true, status: 'active' });

      const result = await controller.activate(mockRequest);

      expect(mockOnboardingService.activate).toHaveBeenCalledWith(MERCHANT_ID);
      expect(result).toEqual({ activated: true, status: 'active' });
    });

    it('should propagate BadRequestException from service', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockOnboardingService.activate.mockRejectedValue(
        new BadRequestException({ error: 'Missing requirements', details: ['channel'] }),
      );

      await expect(controller.activate(mockRequest)).rejects.toThrow(BadRequestException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Auth: SessionAuthGuard metadata check
  // ────────────────────────────────────────────────────────────────────────

  describe('Auth: SessionAuthGuard protects endpoints', () => {
    it('should have SessionAuthGuard applied to controller class', () => {
      // In NestJS unit tests, guards are not executed in method calls — they run
      // in the HTTP pipeline. We verify the guard IS configured via metadata.
      const guards = Reflect.getMetadata('__guards__', OnboardingController);
      expect(guards).toBeDefined();
      expect(guards).toContain(SessionAuthGuard);
    });
  });
});
