import { Test, TestingModule } from '@nestjs/testing';
import { ProductRepository } from './product.repository';
import { PrismaService } from '../prisma/prisma.service';
import { Product, ProductVariant } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('ProductRepository', () => {
  let repository: ProductRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockVariant: ProductVariant = {
    id: 'var_123',
    productId: 'prod_123',
    sku: 'SKU001',
    name: 'Default',
    price: new Decimal(49.99),
    stock: 100,
    isActive: true,
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T00:00:00Z'),
  };

  const mockProduct: Product & { variants: ProductVariant[] } = {
    id: 'prod_123',
    name: 'Camisa Azul',
    description: 'Camisa de algodón',
    categoryId: 'cat_123',
    merchantId: 'merch_123',
    isActive: true,
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T00:00:00Z'),
    variants: [mockVariant],
  };

  beforeEach(async () => {
    const mockPrisma = {
      product: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<ProductRepository>(ProductRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new product with variants', async () => {
      prisma.product.create.mockResolvedValue(mockProduct);

      const result = await repository.create({
        name: 'Camisa Azul',
        description: 'Camisa de algodón',
        category: { connect: { id: 'cat_123' } },
        merchant: { connect: { id: 'merch_123' } },
        isActive: true,
      });

      expect(result).toEqual(mockProduct);
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.any(Object),
        include: { variants: true },
      });
    });
  });

  describe('search', () => {
    it('should search products by text query', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);

      const result = await repository.search('merch_123', 'camisa', 20, true);

      expect(result).toEqual([mockProduct]);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          merchantId: 'merch_123',
          OR: [
            { name: { contains: 'camisa', mode: 'insensitive' } },
            { description: { contains: 'camisa', mode: 'insensitive' } },
          ],
          isActive: true,
          variants: {
            some: {
              isActive: true,
              stock: { gt: 0 },
            },
          },
        },
        include: {
          variants: {
            where: {
              isActive: true,
              stock: { gt: 0 },
            },
          },
        },
        take: 20,
        orderBy: [{ name: 'asc' }],
      });
    });

    it('should return empty array when no products found', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      const result = await repository.search('merch_123', 'nonexistent', 20, true);

      expect(result).toEqual([]);
    });

    it('should filter by merchant (multi-tenancy)', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await repository.search('merch_456', 'camisa', 20, true);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: 'merch_456',
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should find product by ID with variants', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await repository.findById('prod_123');

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod_123' },
        include: { variants: true },
      });
    });

    it('should return null if not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsertVariant', () => {
    it('should create new variant if SKU does not exist', async () => {
      prisma.productVariant.upsert.mockResolvedValue(mockVariant);

      const result = await repository.upsertVariant('prod_123', 'SKU002', {
        product: { connect: { id: 'prod_123' } },
        sku: 'SKU002',
        name: 'Default',
        price: new Decimal(59.99),
        stock: 50,
        isActive: true,
      });

      expect(result).toEqual(mockVariant);
      expect(prisma.productVariant.upsert).toHaveBeenCalled();
    });

    it('should update existing variant if SKU exists', async () => {
      const updatedVariant = { ...mockVariant, stock: 150 };
      prisma.productVariant.upsert.mockResolvedValue(updatedVariant);

      const result = await repository.upsertVariant('prod_123', 'SKU001', {
        product: { connect: { id: 'prod_123' } },
        sku: 'SKU001',
        name: 'Default',
        price: new Decimal(49.99),
        stock: 150,
        isActive: true,
      });

      expect(result.stock).toBe(150);
    });
  });

  describe('findByCategory', () => {
    it('should find products by category', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);

      const result = await repository.findByCategory('cat_123', true);

      expect(result).toEqual([mockProduct]);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat_123', isActive: true },
        include: { variants: true },
        orderBy: { name: 'asc' },
      });
    });

    it('should include inactive products when onlyActive is false', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);

      const result = await repository.findByCategory('cat_123', false);

      expect(result).toEqual([mockProduct]);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat_123' },
        include: { variants: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findByMerchant', () => {
    it('should find all products for a merchant', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);

      const result = await repository.findByMerchant('merch_123');

      expect(result).toEqual([mockProduct]);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { merchantId: 'merch_123' },
        include: { variants: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
