import { Test, TestingModule } from '@nestjs/testing';
import { CategoryRepository } from './category.repository';
import { PrismaService } from '../prisma/prisma.service';
import { Category } from '@prisma/client';

describe('CategoryRepository', () => {
  let repository: CategoryRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockCategory: Category = {
    id: 'cat_123',
    name: 'Ropa',
    merchantId: 'merch_123',
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrisma = {
      category: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<CategoryRepository>(CategoryRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new category', async () => {
      prisma.category.create.mockResolvedValue(mockCategory);

      const result = await repository.create({
        name: 'Ropa',
        merchant: { connect: { id: 'merch_123' } },
      });

      expect(result).toEqual(mockCategory);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: 'Ropa',
          merchant: { connect: { id: 'merch_123' } },
        },
      });
    });
  });

  describe('findByMerchant', () => {
    it('should find all categories for a merchant', async () => {
      const categories = [mockCategory];
      prisma.category.findMany.mockResolvedValue(categories);

      const result = await repository.findByMerchant('merch_123');

      expect(result).toEqual(categories);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { merchantId: 'merch_123' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findByNameAndMerchant', () => {
    it('should find category by name and merchant', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);

      const result = await repository.findByNameAndMerchant('Ropa', 'merch_123');

      expect(result).toEqual(mockCategory);
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: {
          merchantId_name: {
            merchantId: 'merch_123',
            name: 'Ropa',
          },
        },
      });
    });

    it('should return null if not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      const result = await repository.findByNameAndMerchant('NonExistent', 'merch_123');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find category by ID', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);

      const result = await repository.findById('cat_123');

      expect(result).toEqual(mockCategory);
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat_123' },
      });
    });
  });
});
