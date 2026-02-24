import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { ProductRepository } from '../persistence/repositories/product.repository';
import { CategoryRepository } from '../persistence/repositories/category.repository';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Product, ProductVariant } from '@prisma/client';

describe('CatalogService', () => {
  let service: CatalogService;
  let productRepository: jest.Mocked<ProductRepository>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let categoryRepository: jest.Mocked<CategoryRepository>;
  let configService: jest.Mocked<ConfigService>;

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
    const mockProductRepo = {
      search: jest.fn(),
      searchFts: jest.fn(), // PR-03.5.2
      findById: jest.fn(),
      findByCategory: jest.fn(),
      findByMerchant: jest.fn(),
    };

    const mockCategoryRepo = {
      findById: jest.fn(),
    };

    const mockConfigService = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'CATALOG_FTS_ENABLED') {
          return defaultValue ?? true; // Default to true
        }
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: ProductRepository,
          useValue: mockProductRepo,
        },
        {
          provide: CategoryRepository,
          useValue: mockCategoryRepo,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    productRepository = module.get(ProductRepository);
    categoryRepository = module.get(CategoryRepository);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchProducts', () => {
    it('should search products by query (with FTS enabled by default)', async () => {
      productRepository.searchFts.mockResolvedValue([mockProduct]);

      const result = await service.searchProducts('merch_123', 'camisa', 20);

      expect(result).toEqual([mockProduct]);
      expect(productRepository.searchFts).toHaveBeenCalledWith('merch_123', 'camisa', 20);
    });

    it('should return empty array when no products found', async () => {
      productRepository.searchFts.mockResolvedValue([]);

      const result = await service.searchProducts('merch_123', 'nonexistent', 20);

      expect(result).toEqual([]);
    });

    it('should use default limit if not provided', async () => {
      productRepository.searchFts.mockResolvedValue([]);

      await service.searchProducts('merch_123', 'camisa');

      expect(productRepository.searchFts).toHaveBeenCalledWith('merch_123', 'camisa', 20);
    });
  });

  describe('getProduct', () => {
    it('should get product by ID', async () => {
      productRepository.findById.mockResolvedValue(mockProduct);

      const result = await service.getProduct('prod_123', 'merch_123');

      expect(result).toEqual(mockProduct);
      expect(productRepository.findById).toHaveBeenCalledWith('prod_123');
    });

    it('should throw NotFoundException if product not found', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(service.getProduct('nonexistent', 'merch_123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if product belongs to different merchant', async () => {
      const otherMerchantProduct = { ...mockProduct, merchantId: 'merch_456' };
      productRepository.findById.mockResolvedValue(otherMerchantProduct);

      await expect(service.getProduct('prod_123', 'merch_123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByCategory', () => {
    it('should get products by category', async () => {
      productRepository.findByCategory.mockResolvedValue([mockProduct]);

      const result = await service.getByCategory('cat_123', 'merch_123', true);

      expect(result).toEqual([mockProduct]);
      expect(productRepository.findByCategory).toHaveBeenCalledWith('cat_123', true);
    });

    it('should filter out products from other merchants', async () => {
      const otherMerchantProduct = {
        ...mockProduct,
        id: 'prod_999',
        merchantId: 'merch_456',
      };
      productRepository.findByCategory.mockResolvedValue([mockProduct, otherMerchantProduct]);

      const result = await service.getByCategory('cat_123', 'merch_123', true);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod_123');
      expect(result[0].merchantId).toBe('merch_123');
    });
  });

  describe('getByMerchant', () => {
    it('should get all products for a merchant', async () => {
      productRepository.findByMerchant.mockResolvedValue([mockProduct]);

      const result = await service.getByMerchant('merch_123');

      expect(result).toEqual([mockProduct]);
      expect(productRepository.findByMerchant).toHaveBeenCalledWith('merch_123');
    });
  });

  // ============================================================================
  // PR-03.5.2: Full-Text Search Feature Flag Tests (AC-04)
  // ============================================================================

  describe('searchProducts with FTS flag - AC-04', () => {
    it('AC-04: should use FTS when CATALOG_FTS_ENABLED=true (default)', async () => {
      // Default behavior (flag enabled)
      productRepository.searchFts.mockResolvedValue([mockProduct]);

      const result = await service.searchProducts('merch_123', 'test', 20);

      expect(result).toEqual([mockProduct]);
      expect(productRepository.searchFts).toHaveBeenCalledWith('merch_123', 'test', 20);
      expect(productRepository.search).not.toHaveBeenCalled();
    });

    it('AC-04: should use ILIKE search when CATALOG_FTS_ENABLED=false', async () => {
      // Mock flag disabled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'CATALOG_FTS_ENABLED') {
          return false;
        }
        return defaultValue;
      });

      // Recreate service with flag disabled
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CatalogService,
          {
            provide: ProductRepository,
            useValue: productRepository,
          },
          {
            provide: CategoryRepository,
            useValue: categoryRepository,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const serviceWithFlagOff = module.get<CatalogService>(CatalogService);

      productRepository.search.mockResolvedValue([mockProduct]);

      const result = await serviceWithFlagOff.searchProducts('merch_123', 'test', 20);

      expect(result).toEqual([mockProduct]);
      expect(productRepository.search).toHaveBeenCalledWith('merch_123', 'test', 20, true);
      expect(productRepository.searchFts).not.toHaveBeenCalled();
    });
  });
});
