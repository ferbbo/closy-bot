import { Test, TestingModule } from '@nestjs/testing';
import { MerchantRepository } from './merchant.repository';
import { PrismaService } from '../prisma/prisma.service';
import { Merchant } from '@prisma/client';

describe('MerchantRepository', () => {
  let repository: MerchantRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockMerchant: Merchant = {
    id: 'merch_123',
    name: 'Test Store',
    whatsappNumber: '+573009876543',
    apiKey: 'sk_test_1234567890abcdef',
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrisma = {
      merchant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<MerchantRepository>(MerchantRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new merchant', async () => {
      prisma.merchant.create.mockResolvedValue(mockMerchant);

      const result = await repository.create({
        name: 'Test Store',
        whatsappNumber: '+573009876543',
        apiKey: 'sk_test_1234567890abcdef',
      });

      expect(result).toEqual(mockMerchant);
      expect(prisma.merchant.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Store',
          whatsappNumber: '+573009876543',
          apiKey: 'sk_test_1234567890abcdef',
        },
      });
    });

    it('should throw error on duplicate apiKey', async () => {
      const duplicateError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prisma.merchant.create.mockRejectedValue(duplicateError);

      await expect(
        repository.create({
          name: 'Test Store',
          whatsappNumber: '+573009876543',
          apiKey: 'sk_test_1234567890abcdef',
        }),
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('findByApiKey', () => {
    it('should find merchant by API key', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await repository.findByApiKey('sk_test_1234567890abcdef');

      expect(result).toEqual(mockMerchant);
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { apiKey: 'sk_test_1234567890abcdef' },
      });
    });

    it('should return null if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await repository.findByApiKey('invalid_key');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find merchant by ID', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await repository.findById('merch_123');

      expect(result).toEqual(mockMerchant);
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'merch_123' },
      });
    });
  });

  describe('update', () => {
    it('should update merchant data', async () => {
      const updatedMerchant = { ...mockMerchant, name: 'Updated Store' };
      prisma.merchant.update.mockResolvedValue(updatedMerchant);

      const result = await repository.update('merch_123', {
        name: 'Updated Store',
      });

      expect(result).toEqual(updatedMerchant);
      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'merch_123' },
        data: { name: 'Updated Store' },
      });
    });
  });
});
