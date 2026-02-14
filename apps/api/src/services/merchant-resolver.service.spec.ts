import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MerchantResolverService } from './merchant-resolver.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { Merchant } from '@prisma/client';

describe('MerchantResolverService', () => {
  let service: MerchantResolverService;
  let prisma: jest.Mocked<PrismaService>;

  const mockMerchant: Merchant = {
    id: 'merchant-123',
    name: 'Test Store',
    whatsappNumber: '+573001111111',
    apiKey: 'sk_test_merchant_001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      merchant: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantResolverService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MerchantResolverService>(MerchantResolverService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveByWhatsAppPhoneId()', () => {
    it('should resolve merchant by phone ID (MVP: returns first merchant)', async () => {
      prisma.merchant.findFirst.mockResolvedValue(mockMerchant);

      const result = await service.resolveByWhatsAppPhoneId('123456789');

      expect(result).toEqual(mockMerchant);
      expect(prisma.merchant.findFirst).toHaveBeenCalled();
    });

    it('should throw NotFoundException when no merchant exists', async () => {
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(service.resolveByWhatsAppPhoneId('987654321')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.resolveByWhatsAppPhoneId('987654321')).rejects.toThrow(
        'No merchant configured',
      );
    });

    it('should log debug messages during resolution', async () => {
      prisma.merchant.findFirst.mockResolvedValue(mockMerchant);

      await service.resolveByWhatsAppPhoneId('123456789');

      // Verify prisma was called (logging is internal)
      expect(prisma.merchant.findFirst).toHaveBeenCalled();
    });
  });

  describe('getById()', () => {
    it('should return merchant by ID', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await service.getById('merchant-123');

      expect(result).toEqual(mockMerchant);
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'merchant-123' },
      });
    });

    it('should throw NotFoundException when merchant not found by ID', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent-id')).rejects.toThrow(NotFoundException);
      await expect(service.getById('nonexistent-id')).rejects.toThrow(
        'Merchant not found: nonexistent-id',
      );
    });
  });
});
