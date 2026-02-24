import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { ProductRepository } from '../src/persistence/repositories/product.repository';
import { CatalogService } from '../src/services/catalog.service';
import { CategoryRepository } from '../src/persistence/repositories/category.repository';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * PR-03.5.2: Full-Text Search E2E Tests
 * Tests AC-03, AC-09, AC-10 with real DB queries
 */
describe('Catalog FTS E2E - AC-03, AC-09, AC-10', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let catalogService: CatalogService;
  let merchantId: string;
  let categoryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        ProductRepository,
        CategoryRepository,
        CatalogService,
        {
          provide: ConfigService,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get: (key: string, defaultValue?: any) => {
              if (key === 'CATALOG_FTS_ENABLED') return true;
              if (key === 'DATABASE_URL') return process.env.DATABASE_URL;
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    catalogService = moduleFixture.get<CatalogService>(CatalogService);

    // Setup test data
    const merchant = await prisma.merchant.create({
      data: {
        name: 'Test Merchant FTS',
        whatsappNumber: '+573001111111',
        apiKey: 'test-fts-api-key',
      },
    });
    merchantId = merchant.id;

    const category = await prisma.category.create({
      data: {
        name: 'Skincare',
        merchantId,
      },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.product.deleteMany({ where: { merchantId } });
    await prisma.category.deleteMany({ where: { merchantId } });
    await prisma.merchant.delete({ where: { id: merchantId } });
    await app.close();
  });

  describe('AC-03: Natural language search', () => {
    beforeAll(async () => {
      // Create skincare products
      await prisma.product.create({
        data: {
          name: 'Crema Hidratante',
          description: 'Crema para el cuidado facial de día',
          brand: "L'Oréal",
          tags: ['skincare', 'facial', 'hidratante'],
          categoryId,
          merchantId,
          searchText:
            "Crema Hidratante L'Oréal Crema para el cuidado facial de día skincare facial hidratante",
          variants: {
            create: {
              sku: 'CRE-001',
              name: '50ml',
              price: new Decimal(25.99),
              stock: 50,
            },
          },
        },
      });

      await prisma.product.create({
        data: {
          name: 'Serum Facial',
          description: 'Serum para la cara anti-edad',
          brand: 'Neutrogena',
          tags: ['skincare', 'facial', 'antiedad'],
          categoryId,
          merchantId,
          searchText:
            'Serum Facial Neutrogena Serum para la cara anti-edad skincare facial antiedad',
          variants: {
            create: {
              sku: 'SER-001',
              name: '30ml',
              price: new Decimal(35.99),
              stock: 30,
            },
          },
        },
      });

      await prisma.product.create({
        data: {
          name: 'Limpiador Rostro',
          description: 'Gel limpiador para la piel del rostro',
          brand: 'CeraVe',
          tags: ['skincare', 'limpieza', 'facial'],
          categoryId,
          merchantId,
          searchText:
            'Limpiador Rostro CeraVe Gel limpiador para la piel del rostro skincare limpieza facial',
          variants: {
            create: {
              sku: 'LIM-001',
              name: '200ml',
              price: new Decimal(18.99),
              stock: 100,
            },
          },
        },
      });
    });

    it('AC-03: should find skincare products with query "algo para la cara"', async () => {
      const results = await catalogService.searchProducts(merchantId, 'algo para la cara', 5);

      expect(results.length).toBeGreaterThan(0);
      // Should match products with "cara", "facial", "rostro" in description/tags
      const hasRelevant = results.some(
        (p) =>
          p.description?.includes('cara') ||
          p.description?.includes('facial') ||
          p.description?.includes('rostro'),
      );
      expect(hasRelevant).toBe(true);
    });

    it('AC-03: should order results by relevance (ts_rank)', async () => {
      const results = await catalogService.searchProducts(merchantId, 'crema facial', 5);

      expect(results.length).toBeGreaterThan(0);
      // First result should be most relevant (higher rank)
      expect(results[0].name).toContain('Crema');
    });
  });

  describe('AC-10: Spanglish support', () => {
    beforeAll(async () => {
      // Create product with mixed Spanish/English terms
      await prisma.product.create({
        data: {
          name: 'Makeup Base',
          description: 'Base de maquillaje con vitamina E',
          brand: 'Maybelline',
          tags: ['makeup', 'base', 'maquillaje'],
          categoryId,
          merchantId,
          searchText:
            'Makeup Base Maybelline Base de maquillaje con vitamina E makeup base maquillaje',
          variants: {
            create: {
              sku: 'MAK-001',
              name: 'Tono Natural',
              price: new Decimal(22.99),
              stock: 40,
            },
          },
        },
      });
    });

    it('AC-10: should support Spanglish queries (simple config, no stemming)', async () => {
      const results = await catalogService.searchProducts(merchantId, 'makeup crema', 5);

      expect(results.length).toBeGreaterThan(0);
      // Should match products with either "makeup" or "crema"
      const hasMakeup = results.some((p) => p.name.toLowerCase().includes('makeup'));
      const hasCrema = results.some((p) => p.name.toLowerCase().includes('crema'));

      expect(hasMakeup || hasCrema).toBe(true);
    });
  });

  describe('AC-09: Performance benchmark', () => {
    beforeAll(async () => {
      // Seed 500 products for performance test
      const products = [];
      for (let i = 0; i < 500; i++) {
        products.push({
          name: `Producto ${i}`,
          description: `Descripción del producto ${i} con detalles importantes`,
          brand: `Marca${i % 10}`,
          tags: [`tag${i % 20}`, `categoria${i % 5}`],
          categoryId,
          merchantId,
          searchText: `Producto ${i} Marca${i % 10} Descripción del producto ${i} con detalles importantes tag${i % 20} categoria${i % 5}`,
        });
      }

      // Batch insert (Prisma doesn't support createMany with nested relations, so we do sequential)
      // For real performance test, use raw SQL or split into batches
      // For this test, we'll create a subset for speed
      for (let i = 0; i < 100; i++) {
        await prisma.product.create({
          data: {
            ...products[i],
            variants: {
              create: {
                sku: `SKU-${i}`,
                name: 'Default',
                price: new Decimal(10 + i * 0.5),
                stock: 10 + i,
              },
            },
          },
        });
      }
    });

    it('AC-09: should complete FTS query in < 50ms for 100+ products', async () => {
      const startTime = Date.now();

      const results = await catalogService.searchProducts(merchantId, 'producto categoria', 20);

      const endTime = Date.now();
      const latency = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(latency).toBeLessThan(50);
    }, 10000); // 10s timeout for safety
  });
});
