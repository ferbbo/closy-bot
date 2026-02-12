import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service';
import { CategoryRepository } from '../persistence/repositories/category.repository';
import { ProductRepository } from '../persistence/repositories/product.repository';
import { BadRequestException } from '@nestjs/common';
import { Category, Product, ProductVariant } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('ImportService', () => {
  let service: ImportService;
  let categoryRepository: jest.Mocked<CategoryRepository>;
  let productRepository: jest.Mocked<ProductRepository>;

  const mockCategory: Category = {
    id: 'cat_123',
    name: 'Ropa',
    merchantId: 'merch_123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVariant: ProductVariant = {
    id: 'var_123',
    productId: 'prod_123',
    sku: 'SKU001',
    name: 'Default',
    price: new Decimal(49.99),
    stock: 100,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProduct: Product & { variants: ProductVariant[] } = {
    id: 'prod_123',
    name: 'Camisa Azul',
    description: 'Camisa de algodón',
    categoryId: 'cat_123',
    merchantId: 'merch_123',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [mockVariant],
  };

  beforeEach(async () => {
    const mockCategoryRepo = {
      findByNameAndMerchant: jest.fn(),
      create: jest.fn(),
    };

    const mockProductRepo = {
      findByMerchant: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findVariantBySku: jest.fn(),
      upsertVariant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        {
          provide: CategoryRepository,
          useValue: mockCategoryRepo,
        },
        {
          provide: ProductRepository,
          useValue: mockProductRepo,
        },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
    categoryRepository = module.get(CategoryRepository);
    productRepository = module.get(ProductRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('importFromCSV', () => {
    const validCsv = `name,description,category,sku,price,stock
Camisa Azul,Camisa de algodón,Ropa,SKU001,49.99,100
Pantalón Negro,Pantalón casual,Ropa,SKU002,79.99,50`;

    it('should successfully import valid CSV', async () => {
      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);
      productRepository.create.mockResolvedValue(mockProduct);

      const result = await service.importFromCSV('merch_123', validCsv);

      expect(result.success).toBe(true);
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should create category if not exists', async () => {
      categoryRepository.findByNameAndMerchant.mockResolvedValue(null);
      categoryRepository.create.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);
      productRepository.create.mockResolvedValue(mockProduct);

      await service.importFromCSV('merch_123', validCsv);

      expect(categoryRepository.create).toHaveBeenCalledWith({
        name: 'Ropa',
        merchant: { connect: { id: 'merch_123' } },
      });
    });

    it('should update existing products (idempotency)', async () => {
      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([mockProduct]);
      productRepository.findVariantBySku.mockResolvedValue(mockVariant);
      productRepository.upsertVariant.mockResolvedValue(mockVariant);

      const result = await service.importFromCSV('merch_123', validCsv);

      expect(result.updated).toBeGreaterThan(0);
      expect(productRepository.upsertVariant).toHaveBeenCalled();
    });

    it('should reject empty CSV', async () => {
      const emptyCsv = '';

      await expect(service.importFromCSV('merch_123', emptyCsv)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject CSV without required columns', async () => {
      const invalidCsv = `name,description
Camisa,Bonita`;

      await expect(service.importFromCSV('merch_123', invalidCsv)).rejects.toThrow(
        'Missing required column',
      );
    });

    it('should validate price is positive', async () => {
      const invalidCsv = `name,description,category,sku,price,stock
Camisa,Bonita,Ropa,SKU001,-10,100`;

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);

      const result = await service.importFromCSV('merch_123', invalidCsv);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('price');
      expect(result.errors[0].message).toContain('positive');
    });

    it('should validate stock is non-negative', async () => {
      const invalidCsv = `name,description,category,sku,price,stock
Camisa,Bonita,Ropa,SKU001,49.99,-5`;

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);

      const result = await service.importFromCSV('merch_123', invalidCsv);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('stock');
    });

    it('should require name field', async () => {
      const invalidCsv = `name,description,category,sku,price,stock
,Bonita,Ropa,SKU001,49.99,100`;

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);

      const result = await service.importFromCSV('merch_123', invalidCsv);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('name');
    });

    it('should report specific row numbers for errors', async () => {
      const mixedCsv = `name,description,category,sku,price,stock
Camisa,Bonita,Ropa,SKU001,49.99,100
,Invalid,Ropa,SKU002,29.99,50`;

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);
      productRepository.create.mockResolvedValue(mockProduct);

      const result = await service.importFromCSV('merch_123', mixedCsv);

      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(3); // Second data row
    });

    it('should require SKU field for idempotency', async () => {
      const invalidCsv = `name,description,category,sku,price,stock
Camisa,Bonita,Ropa,,49.99,100`;

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);

      const result = await service.importFromCSV('merch_123', invalidCsv);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('sku');
      expect(result.errors[0].message).toContain('required');
    });

    it('should be idempotent when re-importing same CSV with SKUs', async () => {
      const mockProduct2 = {
        ...mockProduct,
        id: 'prod_456',
        name: 'Pantalón Negro',
        description: 'Pantalón casual',
        variants: [{ ...mockVariant, id: 'var_456', productId: 'prod_456', sku: 'SKU002' }],
      };

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([mockProduct, mockProduct2]);
      productRepository.findVariantBySku.mockResolvedValue(mockVariant);
      productRepository.upsertVariant.mockResolvedValue(mockVariant);

      // First import
      const result1 = await service.importFromCSV('merch_123', validCsv);
      expect(result1.updated).toBe(2);
      expect(result1.created).toBe(0);

      // Second import (re-run)
      const result2 = await service.importFromCSV('merch_123', validCsv);
      expect(result2.updated).toBe(2);
      expect(result2.created).toBe(0);

      // Should not create duplicate variants
      expect(productRepository.create).not.toHaveBeenCalled();
    });

    it('should handle duplicate SKUs in same CSV (last wins)', async () => {
      const duplicateCsv = `name,description,category,sku,price,stock
Camisa,Primera version,Ropa,SKU001,49.99,100
Camisa,Segunda version,Ropa,SKU001,59.99,150`;

      categoryRepository.findByNameAndMerchant.mockResolvedValue(mockCategory);
      productRepository.findByMerchant.mockResolvedValue([]);
      productRepository.create.mockResolvedValue(mockProduct);
      // Second row hits update path; findVariantBySku returns the variant created by row 1
      productRepository.findVariantBySku.mockResolvedValue(mockVariant);
      productRepository.upsertVariant.mockResolvedValue({
        ...mockVariant,
        price: new Decimal(59.99),
        stock: 150,
      });

      const result = await service.importFromCSV('merch_123', duplicateCsv);

      // First row creates product+variant inline, second upserts existing variant
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(0);
      // Last value should win
      expect(productRepository.upsertVariant).toHaveBeenLastCalledWith(
        expect.any(String),
        'SKU001',
        expect.objectContaining({
          price: new Decimal(59.99),
          stock: 150,
        }),
      );
    });
  });
});
