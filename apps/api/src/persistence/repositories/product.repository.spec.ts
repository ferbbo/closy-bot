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

  // ============================================================================
  // PR-03.5.2: Full-Text Search Tests
  // ============================================================================

  describe('searchFts - AC-03, AC-05, AC-06, AC-11, AC-12', () => {
    const mockFtsProduct = {
      ...mockProduct,
      brand: 'BrandTest',
      tags: ['skincare', 'facial'],
      imageUrls: ['https://example.com/image.jpg'],
      searchText: 'Crema Facial BrandTest Para el cuidado de la piel skincare facial',
    };

    beforeEach(() => {
      // Always mock $queryRaw before each test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw = jest.fn();
    });

    it('AC-03: should find products by natural language query using FTS', async () => {
      // Mock $queryRaw to return products with rank
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([{ ...mockFtsProduct, rank: 0.8 }]);

      // Mock findMany to load variants (second phase)
      prisma.product.findMany.mockResolvedValue([mockFtsProduct]);

      const result = await repository.searchFts('merch_123', 'crema facial', 20);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Camisa Azul'); // Mock data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((prisma as any).$queryRaw).toHaveBeenCalled();
    });

    it('AC-03: should order results by ts_rank (DESC)', async () => {
      const product1 = { ...mockFtsProduct, id: 'prod_1', rank: 0.5 };
      const product2 = { ...mockFtsProduct, id: 'prod_2', rank: 0.9 };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([product1, product2]);

      prisma.product.findMany.mockResolvedValue([
        { ...mockFtsProduct, id: 'prod_2' },
        { ...mockFtsProduct, id: 'prod_1' },
      ]);

      const result = await repository.searchFts('merch_123', 'test', 20);

      // Should be ordered by rank DESC (prod_2 before prod_1)
      expect(result[0].id).toBe('prod_2');
      expect(result[1].id).toBe('prod_1');
    });

    it('AC-05: should match multi-word queries', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([{ ...mockFtsProduct, rank: 0.7 }]);

      prisma.product.findMany.mockResolvedValue([mockFtsProduct]);

      const result = await repository.searchFts('merch_123', 'camiseta roja M', 20);

      expect(result).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((prisma as any).$queryRaw).toHaveBeenCalled();
    });

    it('AC-06: should fallback to ILIKE when FTS returns 0 results', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([]);

      // Mock ILIKE search (fallback)
      prisma.product.findMany.mockResolvedValue([mockProduct]);

      const result = await repository.searchFts('merch_123', 'typo query xyz', 20);

      expect(result).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((prisma as any).$queryRaw).toHaveBeenCalled();
      // Should call prisma.product.findMany (ILIKE fallback)
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: 'merch_123',
          }),
        }),
      );
    });

    it('AC-06: should fallback to ILIKE on FTS error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockRejectedValue(new Error('FTS index not found'));

      prisma.product.findMany.mockResolvedValue([mockProduct]);

      const result = await repository.searchFts('merch_123', 'test', 20);

      expect(result).toHaveLength(1);
      expect(prisma.product.findMany).toHaveBeenCalled();
    });

    it('AC-11: should filter by active products with available stock', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([{ ...mockFtsProduct, rank: 0.8 }]);

      prisma.product.findMany.mockResolvedValue([mockFtsProduct]);

      await repository.searchFts('merch_123', 'test', 20);

      // Verify second phase filters by active + stock
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            variants: {
              some: {
                isActive: true,
                stock: { gt: 0 },
              },
            },
          }),
        }),
      );
    });

    it('AC-12: should include variants in FTS results', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([{ ...mockFtsProduct, rank: 0.8 }]);

      prisma.product.findMany.mockResolvedValue([mockFtsProduct]);

      const result = await repository.searchFts('merch_123', 'test', 20);

      expect(result[0].variants).toBeDefined();
      expect(Array.isArray(result[0].variants)).toBe(true);
    });

    it('should return empty array for empty query', async () => {
      const result = await repository.searchFts('merch_123', '', 20);

      expect(result).toEqual([]);
      // $queryRaw should not be called for empty query
    });

    it('should filter by merchantId (multi-tenancy)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$queryRaw.mockResolvedValue([]);

      await repository.searchFts('merch_456', 'test', 20);

      // $queryRaw should be called (even if returns 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((prisma as any).$queryRaw).toHaveBeenCalled();
    });
  });
});
