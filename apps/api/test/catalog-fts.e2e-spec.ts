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
          description: 'Crema para la cara con algo de protección UV',
          brand: "L'Oréal",
          tags: ['skincare', 'facial', 'hidratante'],
          categoryId,
          merchantId,
          searchText:
            "Crema Hidratante L'Oréal Crema para la cara con algo de protección UV skincare facial hidratante",
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
          description: 'Serum para la cara anti-edad, algo intensivo',
          brand: 'Neutrogena',
          tags: ['skincare', 'facial', 'antiedad'],
          categoryId,
          merchantId,
          searchText:
            'Serum Facial Neutrogena Serum para la cara anti-edad, algo intensivo skincare facial antiedad',
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

  describe('AC-05: Multi-field search (including variants)', () => {
    beforeAll(async () => {
      // Create clothing products with color/size variants
      await prisma.product.create({
        data: {
          name: 'Camiseta Deportiva',
          description: 'Camiseta roja de algodón para deporte',
          brand: 'Nike',
          tags: ['ropa', 'deportiva', 'camiseta'],
          categoryId,
          merchantId,
          searchText:
            'Camiseta Deportiva Nike Camiseta roja de algodón para deporte ropa deportiva camiseta talla M talla L',
          variants: {
            create: [
              {
                sku: 'CAM-001-M',
                name: 'talla M',
                price: new Decimal(29.99),
                stock: 20,
              },
              {
                sku: 'CAM-001-L',
                name: 'talla L',
                price: new Decimal(29.99),
                stock: 15,
              },
            ],
          },
        },
      });
    });

    it('AC-05: should find products by variant attributes (talla)', async () => {
      // Query includes variant attribute "talla M"
      const results = await catalogService.searchProducts(merchantId, 'camiseta roja talla M', 5);

      expect(results.length).toBeGreaterThan(0);
      // Should match product with "camiseta", "roja", and "talla M" in searchText
      const hasCamiseta = results.some(
        (p) => p.name.includes('Camiseta') && p.searchText?.includes('talla M'),
      );
      expect(hasCamiseta).toBe(true);
    });
  });

  describe('AC-10: Spanglish support', () => {
    beforeAll(async () => {
      // Create products with mixed Spanish/English terms for Spanglish testing
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

      await prisma.product.create({
        data: {
          name: 'Crema Makeup Hidratante',
          description: 'Crema hidratante con color para un makeup natural',
          brand: 'Revlon',
          tags: ['makeup', 'crema', 'hidratante'],
          categoryId,
          merchantId,
          searchText:
            'Crema Makeup Hidratante Revlon Crema hidratante con color para un makeup natural makeup crema hidratante',
          variants: {
            create: {
              sku: 'MAK-002',
              name: 'Tono Claro',
              price: new Decimal(28.99),
              stock: 25,
            },
          },
        },
      });
    });

    it('AC-10: should support Spanglish queries (simple config, 2+ word queries)', async () => {
      // Query "makeup crema" - plainto_tsquery AND-strict behavior requires both terms
      const results = await catalogService.searchProducts(merchantId, 'makeup crema', 5);

      expect(results.length).toBeGreaterThan(0);
      // Should match products with BOTH "makeup" AND "crema"
      const hasMatch = results.some(
        (p) =>
          (p.name.toLowerCase().includes('makeup') && p.name.toLowerCase().includes('crema')) ||
          (p.searchText?.includes('makeup') && p.searchText?.includes('crema')),
      );
      expect(hasMatch).toBe(true);
    });
  });

  describe('AC-09: Performance benchmark', () => {
    beforeAll(async () => {
      // Seed 500 products for performance validation per AC-09 requirement
      // Using raw SQL for bulk insert to avoid E2E test timeout
      const values: string[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (let i = 0; i < 500; i++) {
        const name = `Producto ${i}`;
        const description = `Descripción del producto ${i} con características detalladas y marca relevante`;
        const brand = `Marca${i % 10}`;
        const tags = `{tag${i % 20},categoria${i % 5}}`;
        const imageUrls = '{}';
        const searchText = `${name} ${brand} ${description} tag${i % 20} categoria${i % 5}`;

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, true, NOW(), NOW())`,
        );
        values.push(name, description, brand, tags, imageUrls, searchText, categoryId, merchantId);
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "products" (name, description, brand, tags, image_urls, search_text, category_id, merchant_id, is_active, created_at, updated_at) VALUES ${placeholders.join(', ')}`,
        ...values,
      );

      // Create variants for a subset (first 100) to avoid bloat
      const products = await prisma.product.findMany({
        where: { merchantId, name: { startsWith: 'Producto ' } },
        take: 100,
      });

      for (const product of products) {
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: `SKU-${product.name}`,
            name: 'Default',
            price: new Decimal(19.99),
            stock: 50,
          },
        });
      }
    });

    it('AC-09: should handle 500 products search with GIN index and < 50ms latency', async () => {
      const start = Date.now();
      const results = await catalogService.searchProducts(merchantId, 'producto marca', 10);
      const elapsed = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(50);
    });

    it('AC-09: should use GIN index for FTS queries (EXPLAIN ANALYZE validation)', async () => {
      // Execute EXPLAIN ANALYZE to verify GIN index usage
      const query = `producto descripción`;

      const explainOutput = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `
        EXPLAIN ANALYZE
        SELECT id, name, ts_rank(to_tsvector('simple', COALESCE(search_text, '')), plainto_tsquery('simple', $1)) AS rank
        FROM "products"
        WHERE merchant_id = $2
          AND to_tsvector('simple', COALESCE(search_text, '')) @@ plainto_tsquery('simple', $1)
        ORDER BY rank DESC
        LIMIT 10;
      `,
        query,
        merchantId,
      );

      const planText = explainOutput.map((row) => row['QUERY PLAN']).join('\n');

      // Verify GIN index is used (not Sequential Scan)
      expect(planText).toContain('Bitmap Index Scan');
      expect(planText).toContain('idx_product_search_fts');
    });
  });
});
