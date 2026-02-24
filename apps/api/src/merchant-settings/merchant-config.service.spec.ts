/**
 * PR-04.5: MerchantConfigService — Unit Tests
 * AC-06: getOrCreate creates config with preset if none exists
 * AC-07: Presets applied per industry (ropa/belleza/minimarket)
 * AC-09: updateConfig updates only provided fields
 * AC-11: Unit tests covering service methods
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MerchantConfigService } from './merchant-config.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { Industry } from '@prisma/client';
import { MERCHANT_CONFIG_PRESETS, getPresetForIndustry } from './merchant-config-presets';

const mockRopaConfig = {
  id: 'config-ropa-1',
  merchantId: 'merchant-ropa-1',
  paymentMethods: MERCHANT_CONFIG_PRESETS['ropa'].paymentMethods,
  shippingConfig: MERCHANT_CONFIG_PRESETS['ropa'].shippingConfig,
  returnPolicy: MERCHANT_CONFIG_PRESETS['ropa'].returnPolicy,
  currency: 'COP',
  orderCodePrefix: 'ORD',
  autoConfirmCod: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('AC-07: getPresetForIndustry utility', () => {
  it('returns ropa preset for ropa industry', () => {
    const preset = getPresetForIndustry('ropa');
    expect(preset.orderCodePrefix).toBe('ORD');
    expect(preset.paymentMethods).toHaveLength(2);
    expect(preset.currency).toBe('COP');
  });

  it('returns belleza preset for belleza industry', () => {
    const preset = getPresetForIndustry('belleza');
    expect(preset.orderCodePrefix).toBe('ORDEN');
    expect(preset.paymentMethods.some((p) => p.type === 'payment_link')).toBe(true);
    expect(preset.shippingConfig.freeAbove).toBe(50000);
  });

  it('returns minimarket preset for minimarket industry', () => {
    const preset = getPresetForIndustry('minimarket');
    expect(preset.orderCodePrefix).toBe('PED');
    expect(preset.paymentMethods).toHaveLength(1);
    expect(preset.paymentMethods[0].type).toBe('cod');
  });

  it('falls back to ropa preset when industry is null', () => {
    const preset = getPresetForIndustry(null);
    expect(preset.orderCodePrefix).toBe('ORD');
  });

  it('falls back to ropa preset when industry is unknown string', () => {
    const preset = getPresetForIndustry('unknown_industry');
    expect(preset.orderCodePrefix).toBe('ORD');
  });
});

describe('AC-05: All MerchantConfig fields function correctly', () => {
  it('belleza preset has all required fields', () => {
    const b = MERCHANT_CONFIG_PRESETS['belleza'];
    expect(b.currency).toBe('COP');
    expect(b.autoConfirmCod).toBe(true);
    expect(typeof b.returnPolicy).toBe('string');
    expect(b.shippingConfig).toBeDefined();
  });
});

describe('MerchantConfigService', () => {
  let service: MerchantConfigService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantConfigService,
        {
          provide: PrismaService,
          useValue: {
            merchantConfig: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            merchant: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<MerchantConfigService>(MerchantConfigService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // ---------------------------------------------------------------------------
  // AC-06: getOrCreateConfig
  // ---------------------------------------------------------------------------

  describe('AC-06: getOrCreateConfig()', () => {
    it('returns existing config without creating a new one', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(mockRopaConfig);

      const result = await service.getOrCreateConfig('merchant-ropa-1');

      expect(result.id).toBe('config-ropa-1');
      expect(result.orderCodePrefix).toBe('ORD');
      expect(prisma.merchantConfig.create).not.toHaveBeenCalled();
    });

    it('creates config with ropa preset when none exists and industry is ropa', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-ropa-1',
        industry: Industry.ropa,
      });
      (prisma.merchantConfig.create as jest.Mock).mockResolvedValue(mockRopaConfig);

      const result = await service.getOrCreateConfig('merchant-ropa-1');

      expect(prisma.merchantConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: 'merchant-ropa-1',
            currency: 'COP',
            orderCodePrefix: 'ORD',
            autoConfirmCod: true,
          }),
        }),
      );
      expect(result.orderCodePrefix).toBe('ORD');
    });

    it('creates config with belleza preset when industry is belleza', async () => {
      const belConfig = { ...mockRopaConfig, orderCodePrefix: 'ORDEN', merchantId: 'merch-b' };
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merch-b',
        industry: Industry.belleza,
      });
      (prisma.merchantConfig.create as jest.Mock).mockResolvedValue(belConfig);

      const result = await service.getOrCreateConfig('merch-b');

      const createCall = (prisma.merchantConfig.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.orderCodePrefix).toBe('ORDEN');
      expect(result.orderCodePrefix).toBe('ORDEN');
    });

    it('creates config with minimarket preset when industry is minimarket', async () => {
      const mkConfig = { ...mockRopaConfig, orderCodePrefix: 'PED', merchantId: 'merch-mk' };
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merch-mk',
        industry: Industry.minimarket,
      });
      (prisma.merchantConfig.create as jest.Mock).mockResolvedValue(mkConfig);

      await service.getOrCreateConfig('merch-mk');

      const createCall = (prisma.merchantConfig.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.orderCodePrefix).toBe('PED');
    });

    it('uses ropa fallback when merchant has null industry', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merch-noindustry',
        industry: null,
      });
      (prisma.merchantConfig.create as jest.Mock).mockResolvedValue(mockRopaConfig);

      await service.getOrCreateConfig('merch-noindustry');

      const createCall = (prisma.merchantConfig.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.orderCodePrefix).toBe('ORD'); // ropa default
    });

    it('throws NotFoundException when merchant does not exist', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getOrCreateConfig('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09: updateConfig — partial update
  // ---------------------------------------------------------------------------

  describe('AC-09: updateConfig() — only sent fields updated', () => {
    it('updates only returnPolicy leaving other fields unchanged', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(mockRopaConfig);
      const updatedConfig = { ...mockRopaConfig, returnPolicy: 'Nueva política' };
      (prisma.merchantConfig.update as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await service.updateConfig('merchant-ropa-1', {
        returnPolicy: 'Nueva política',
      });

      const updateCall = (prisma.merchantConfig.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data).toEqual({ returnPolicy: 'Nueva política' });
      expect(result.returnPolicy).toBe('Nueva política');
    });

    it('updates paymentMethods without touching shippingConfig', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(mockRopaConfig);
      const newMethods = [{ type: 'cod' as const, label: 'Solo efectivo' }];
      const updatedConfig = { ...mockRopaConfig, paymentMethods: newMethods };
      (prisma.merchantConfig.update as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await service.updateConfig('merchant-ropa-1', {
        paymentMethods: newMethods,
      });

      const updateCall = (prisma.merchantConfig.update as jest.Mock).mock.calls[0][0];
      expect(Object.keys(updateCall.data)).toEqual(['paymentMethods']);
      expect(result.paymentMethods).toEqual(newMethods);
    });

    it('updates autoConfirmCod to false', async () => {
      (prisma.merchantConfig.findUnique as jest.Mock).mockResolvedValue(mockRopaConfig);
      const updatedConfig = { ...mockRopaConfig, autoConfirmCod: false };
      (prisma.merchantConfig.update as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await service.updateConfig('merchant-ropa-1', { autoConfirmCod: false });

      const updateCall = (prisma.merchantConfig.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.autoConfirmCod).toBe(false);
      expect(result.autoConfirmCod).toBe(false);
    });
  });
});
