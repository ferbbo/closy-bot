/**
 * PR-OB-01: OnboardingService Unit Tests
 *
 * AC-01: getProgress() calcula steps dinámicamente sin tabla extra
 * AC-02: percentage calculado correctamente (5 steps × 20%)
 * AC-03: métodos getProgress(), applyPreset(), activate() existen
 * AC-04: applyPreset() actualiza Merchant.industry + playbookConfig
 * AC-05: applyPreset() aplica MerchantConfig defaults
 * AC-06: activate() valida requisitos mínimos
 * AC-07: activate() cambia status a 'active' cuando OK
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MerchantStatus, MessageDirection } from '@prisma/client';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PlaybookService } from '../services/playbook.service';
import { MerchantConfigService } from '../merchant-settings/merchant-config.service';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-test-1';

function makeMerchant(overrides: Record<string, unknown> = {}) {
  return {
    id: MERCHANT_ID,
    name: 'Test Store',
    industry: null,
    playbookConfig: null,
    ...overrides,
  };
}

function makeMerchantWithRelations(
  overrides: {
    name?: string;
    industry?: string | null;
    channels?: { id: string }[];
    products?: { id: string }[];
    merchantConfig?: { id: string; paymentMethods: unknown } | null;
  } = {},
) {
  return {
    id: MERCHANT_ID,
    name: overrides.name ?? 'Test Store',
    industry: overrides.industry ?? null,
    channels: overrides.channels ?? [],
    products: overrides.products ?? [],
    merchantConfig: overrides.merchantConfig ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  merchant: {
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  messageLog: {
    findFirst: jest.fn(),
  },
};

const mockPlaybookService = {
  getPlaybookForMerchant: jest.fn().mockReturnValue({
    industry: 'ropa',
    llmPrompt: {},
    messages: {},
    rules: {},
    checkoutQuestions: [],
  }),
};

const mockMerchantConfigService = {
  getOrCreateConfig: jest.fn().mockResolvedValue({ id: 'config-1' }),
};

// ────────────────────────────────────────────────────────────────────────────
// AC-03: service instancia y tiene todos los métodos
// ────────────────────────────────────────────────────────────────────────────

describe('AC-03: OnboardingService tiene métodos getProgress, applyPreset, activate', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlaybookService, useValue: mockPlaybookService },
        { provide: MerchantConfigService, useValue: mockMerchantConfigService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose getProgress method', () => {
    expect(typeof service.getProgress).toBe('function');
  });

  it('should expose applyPreset method', () => {
    expect(typeof service.applyPreset).toBe('function');
  });

  it('should expose activate method', () => {
    expect(typeof service.activate).toBe('function');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-01: getProgress() calcula steps dinámicamente
// AC-02: percentage calculado correctamente
// ────────────────────────────────────────────────────────────────────────────

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlaybookService, useValue: mockPlaybookService },
        { provide: MerchantConfigService, useValue: mockMerchantConfigService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  describe('AC-01: getProgress() calcula steps dinámicamente', () => {
    it('AC-01: should return all steps pending for a new merchant', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({ name: 'Store', industry: null }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toHaveLength(0);
      expect(progress.pendingSteps).toEqual(['profile', 'channel', 'catalog', 'config', 'test']);
      expect(progress.percentage).toBe(0);
    });

    it('AC-01: profile step complete when name+industry set', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({ name: 'Store', industry: 'ropa' }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toContain('profile');
    });

    it('AC-01: channel step complete when active channel exists', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({
          channels: [{ id: 'ch-1' }],
        }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toContain('channel');
    });

    it('AC-01: catalog step complete when product exists', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({
          products: [{ id: 'prod-1' }],
        }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toContain('catalog');
    });

    it('AC-01: config step complete when merchantConfig has payment methods', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({
          merchantConfig: {
            id: 'cfg-1',
            paymentMethods: [{ type: 'cod', label: 'Contraentrega' }],
          },
        }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toContain('config');
    });

    it('AC-01: config step NOT complete when merchantConfig has empty paymentMethods', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({
          merchantConfig: { id: 'cfg-1', paymentMethods: [] },
        }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).not.toContain('config');
    });

    it('AC-01: test step complete when messageLog IN direction exists', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchantWithRelations());
      mockPrisma.messageLog.findFirst.mockResolvedValue({ id: 'log-1' });

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toContain('test');
    });

    it('AC-01: messageLog query uses merchantId and direction=IN', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchantWithRelations());
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      await service.getProgress(MERCHANT_ID);

      expect(mockPrisma.messageLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: MERCHANT_ID,
            direction: MessageDirection.IN,
          }),
        }),
      );
    });
  });

  describe('AC-02: percentage calculado correctamente', () => {
    it('AC-02: 0 steps → 0%', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchantWithRelations());
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.percentage).toBe(0);
    });

    it('AC-02: 3/5 steps → 60%', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({
          name: 'Store',
          industry: 'ropa',
          channels: [{ id: 'ch-1' }],
          products: [{ id: 'prod-1' }],
        }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.completedSteps).toHaveLength(3);
      expect(progress.percentage).toBe(60);
    });

    it('AC-02: 5/5 steps → 100%', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchantWithRelations({
          name: 'Store',
          industry: 'ropa',
          channels: [{ id: 'ch-1' }],
          products: [{ id: 'prod-1' }],
          merchantConfig: { id: 'cfg-1', paymentMethods: [{ type: 'cod' }] },
        }),
      );
      mockPrisma.messageLog.findFirst.mockResolvedValue({ id: 'log-1' });

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.percentage).toBe(100);
      expect(progress.nextStep).toBeNull();
    });

    it('AC-02: nextStep is first pending step', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchantWithRelations());
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const progress = await service.getProgress(MERCHANT_ID);

      expect(progress.nextStep).toBe('profile');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // AC-04, AC-05: applyPreset()
  // ────────────────────────────────────────────────────────────────────────────

  describe('AC-04, AC-05: applyPreset() aplica preset de industria', () => {
    it('AC-04: should update Merchant.industry and playbookConfig when no existing config', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchant({ playbookConfig: null }),
      );
      mockPrisma.merchant.update.mockResolvedValue({});

      await service.applyPreset(MERCHANT_ID, { industry: 'ropa' });

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MERCHANT_ID },
          data: expect.objectContaining({ industry: 'ropa' }),
        }),
      );
    });

    it('AC-04: should only update industry field when playbookConfig exists (preserve existing)', async () => {
      const existingConfig = { industry: 'belleza', custom: 'value' };
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(
        makeMerchant({ playbookConfig: existingConfig }),
      );
      mockPrisma.merchant.update.mockResolvedValue({});

      await service.applyPreset(MERCHANT_ID, { industry: 'ropa' });

      const updateCall = mockPrisma.merchant.update.mock.calls[0][0];
      expect(updateCall.data.playbookConfig).toEqual(
        expect.objectContaining({ industry: 'ropa', custom: 'value' }),
      );
    });

    it('AC-05: should call getOrCreateConfig to apply MerchantConfig defaults', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchant());
      mockPrisma.merchant.update.mockResolvedValue({});

      await service.applyPreset(MERCHANT_ID, { industry: 'belleza' });

      expect(mockMerchantConfigService.getOrCreateConfig).toHaveBeenCalledWith(MERCHANT_ID);
    });

    it('AC-04: should return { success: true }', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchant());
      mockPrisma.merchant.update.mockResolvedValue({});

      const result = await service.applyPreset(MERCHANT_ID, { industry: 'minimarket' });

      expect(result).toEqual({ success: true });
    });

    it('AC-04: idempotent — applying same preset twice returns success both times', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue(makeMerchant());
      mockPrisma.merchant.update.mockResolvedValue({});

      const first = await service.applyPreset(MERCHANT_ID, { industry: 'ropa' });
      const second = await service.applyPreset(MERCHANT_ID, { industry: 'ropa' });

      expect(first).toEqual({ success: true });
      expect(second).toEqual({ success: true });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // AC-06, AC-07: activate()
  // ────────────────────────────────────────────────────────────────────────────

  describe('AC-06: activate() valida requisitos mínimos', () => {
    it('AC-06: should throw 400 with missingRequirements when channel missing', async () => {
      mockPrisma.merchant.findUniqueOrThrow
        .mockResolvedValueOnce({ id: MERCHANT_ID, status: MerchantStatus.onboarding }) // for activate
        .mockResolvedValueOnce(
          makeMerchantWithRelations({
            // for getProgress
            products: [{ id: 'p1' }],
            merchantConfig: { id: 'c1', paymentMethods: [{ type: 'cod' }] },
          }),
        );
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      let caughtError: BadRequestException | null = null;
      try {
        await service.activate(MERCHANT_ID);
      } catch (e) {
        caughtError = e as BadRequestException;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const response = caughtError!.getResponse() as { error: string; details: string[] };
      expect(response.error).toBe('Missing requirements');
      expect(response.details).toContain('channel');
    });

    it('AC-06: should throw 400 with all missing requirements when catalog and config missing', async () => {
      // Setup for each call: activate (findUniqueOrThrow) + getProgress (findUniqueOrThrow)
      mockPrisma.merchant.findUniqueOrThrow
        .mockResolvedValueOnce({ id: MERCHANT_ID, status: MerchantStatus.onboarding })
        .mockResolvedValueOnce(makeMerchantWithRelations()); // all empty
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      let caughtError: BadRequestException | null = null;
      try {
        await service.activate(MERCHANT_ID);
      } catch (e) {
        caughtError = e as BadRequestException;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const response = caughtError!.getResponse() as { details: string[] };
      expect(response.details).toContain('channel');
      expect(response.details).toContain('catalog');
      expect(response.details).toContain('config');
    });
  });

  describe('AC-07: activate() cambia status a active cuando validación OK', () => {
    it('AC-07: should set Merchant.status=active when all requirements met', async () => {
      mockPrisma.merchant.findUniqueOrThrow
        .mockResolvedValueOnce({ id: MERCHANT_ID, status: MerchantStatus.onboarding })
        .mockResolvedValueOnce(
          makeMerchantWithRelations({
            channels: [{ id: 'ch-1' }],
            products: [{ id: 'p-1' }],
            merchantConfig: { id: 'cfg-1', paymentMethods: [{ type: 'cod' }] },
          }),
        );
      mockPrisma.merchant.update.mockResolvedValue({ id: MERCHANT_ID, status: 'active' });
      mockPrisma.messageLog.findFirst.mockResolvedValue(null);

      const result = await service.activate(MERCHANT_ID);

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MERCHANT_ID },
          data: { status: 'active' },
        }),
      );
      expect(result).toEqual({ activated: true, status: 'active' });
    });

    it('AC-07: idempotent — activating already active merchant returns 200 no-op', async () => {
      mockPrisma.merchant.findUniqueOrThrow.mockResolvedValue({
        id: MERCHANT_ID,
        status: MerchantStatus.active,
      });

      const result = await service.activate(MERCHANT_ID);

      expect(result).toEqual({ activated: true, status: 'active' });
      expect(mockPrisma.merchant.update).not.toHaveBeenCalled();
    });
  });
});
