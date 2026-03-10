import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { Merchant } from '@prisma/client';

/**
 * Integration tests for Catalog Management API
 *
 * Verifies:
 * - API key authentication
 * - Multi-tenant isolation
 * - CSV bulk import idempotency
 * - CRUD operations
 */
describe('Catalog Management API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test merchants
  let merchantA: Merchant;
  let merchantB: Merchant;

  const apiKeyA = 'test-api-key-merchant-a';
  const apiKeyB = 'test-api-key-merchant-b';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);

    // Create test merchants
    merchantA = await prisma.merchant.create({
      data: {
        name: 'Test Merchant A',
        whatsappNumber: '+1234567890',
        apiKey: apiKeyA,
      },
    });

    merchantB = await prisma.merchant.create({
      data: {
        name: 'Test Merchant B',
        whatsappNumber: '+0987654321',
        apiKey: apiKeyB,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.productVariant.deleteMany({
      where: {
        product: {
          merchantId: {
            in: [merchantA.id, merchantB.id],
          },
        },
      },
    });

    await prisma.product.deleteMany({
      where: {
        merchantId: {
          in: [merchantA.id, merchantB.id],
        },
      },
    });

    await prisma.category.deleteMany({
      where: {
        merchantId: {
          in: [merchantA.id, merchantB.id],
        },
      },
    });

    await prisma.merchant.deleteMany({
      where: {
        id: {
          in: [merchantA.id, merchantB.id],
        },
      },
    });

    await app.close();
  });

  beforeEach(async () => {
    // Clean products before each test
    await prisma.productVariant.deleteMany({
      where: {
        product: {
          merchantId: {
            in: [merchantA.id, merchantB.id],
          },
        },
      },
    });

    await prisma.product.deleteMany({
      where: {
        merchantId: {
          in: [merchantA.id, merchantB.id],
        },
      },
    });

    await prisma.category.deleteMany({
      where: {
        merchantId: {
          in: [merchantA.id, merchantB.id],
        },
      },
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key', () => {
      return request(app.getHttpServer()).get('/api/products').expect(401);
    });

    it('should reject requests with invalid API key', () => {
      return request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401);
    });

    it('should accept requests with valid API key (Bearer)', () => {
      return request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .expect(200);
    });

    it('should accept requests with valid API key (x-api-key header)', () => {
      return request(app.getHttpServer())
        .get('/api/products')
        .set('x-api-key', apiKeyA)
        .expect(200);
    });
  });

  describe('POST /api/catalog/import', () => {
    const validCsv = `name,description,category,sku,price,stock
Camisa Azul,Camisa de algodón,Ropa,SKU-001,29.99,10
Pantalón Negro,Pantalón formal,Ropa,SKU-002,49.99,5`;

    it('should import CSV successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: validCsv })
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        created: 2,
        updated: 0,
        errors: [],
      });

      // Verify products exist
      const products = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
        include: { variants: true },
      });

      expect(products).toHaveLength(2);
      expect(products[0].name).toBe('Camisa Azul');
      expect(products[0].variants).toHaveLength(1);
      expect(products[0].variants[0].sku).toBe('SKU-001');
    });

    it('should be idempotent (same CSV imported twice)', async () => {
      // First import
      await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: validCsv })
        .expect(200);

      // Second import (same CSV)
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: validCsv })
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        created: 0,
        updated: 2, // Products updated, not duplicated
        errors: [],
      });

      // Verify no duplicates
      const products = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
      });

      expect(products).toHaveLength(2);
    });

    it('should enforce multi-tenancy (products isolated by merchant)', async () => {
      // Merchant A imports
      await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: validCsv })
        .expect(200);

      // Merchant B imports
      await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyB}`)
        .send({ csv: validCsv })
        .expect(200);

      // Each merchant should have their own products
      const productsA = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
      });
      const productsB = await prisma.product.findMany({
        where: { merchantId: merchantB.id },
      });

      expect(productsA).toHaveLength(2);
      expect(productsB).toHaveLength(2);
      expect(productsA[0].id).not.toBe(productsB[0].id);
    });

    it('should reject CSV with validation errors', async () => {
      const invalidCsv = `name,description,category,sku,price,stock
,Missing name,Ropa,SKU-BAD-001,29.99,10`;

      const res = await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: invalidCsv })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.errors.length).toBeGreaterThan(0);
      expect(res.body.created).toBe(0);
    });

    it('should reject empty CSV body', async () => {
      await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: '' })
        .expect(400);
    });
  });

  describe('POST /api/catalog/import-file (AC-01, AC-02, AC-03, AC-04)', () => {
    const validCsv = `name,description,category,sku,price,stock
Camisa Roja,Camisa de algodón roja,Ropa,SKU-FILE-001,39.99,15
Pantalón Azul,Pantalón vaquero,Ropa,SKU-FILE-002,59.99,8`;

    it('AC-01: should accept valid CSV file and return stats', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(validCsv), 'catalog.csv')
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        created: 2,
        updated: 0,
        errors: [],
      });

      // Verify products exist
      const products = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
        include: { variants: true },
      });

      expect(products).toHaveLength(2);
      expect(products[0].variants).toHaveLength(1);
      expect(products.some((p) => p.name === 'Camisa Roja')).toBe(true);
    });

    it('AC-02: should reject .txt file with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(validCsv), 'catalog.txt')
        .expect(400);

      expect(res.body.message).toBe('Only CSV files are allowed');
    });

    it('AC-03: should reject file larger than 5MB with 413 Payload Too Large', async () => {
      // Create a file > 5MB (5 * 1024 * 1024 bytes)
      const largeCsv = 'a'.repeat(6 * 1024 * 1024);

      const res = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(largeCsv), 'large.csv')
        .expect(413);

      expect(res.body.message).toContain('File size exceeds maximum allowed');
    });

    it('AC-04: should produce same results as JSON import endpoint', async () => {
      // Import via file
      const resFile = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(validCsv), 'catalog.csv')
        .expect(200);

      const productsFromFile = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
        include: { variants: true },
        orderBy: { name: 'asc' },
      });

      // Clean up
      await prisma.productVariant.deleteMany({
        where: { product: { merchantId: merchantA.id } },
      });
      await prisma.product.deleteMany({ where: { merchantId: merchantA.id } });
      await prisma.category.deleteMany({ where: { merchantId: merchantA.id } });

      // Import same CSV via JSON endpoint
      const resJson = await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: validCsv })
        .expect(200);

      const productsFromJson = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
        include: { variants: true },
        orderBy: { name: 'asc' },
      });

      // Stats should match
      expect(resFile.body.created).toBe(resJson.body.created);
      expect(resFile.body.updated).toBe(resJson.body.updated);

      // Products should match
      expect(productsFromFile).toHaveLength(productsFromJson.length);
      expect(productsFromFile[0].name).toBe(productsFromJson[0].name);
      expect(productsFromFile[0].variants[0].sku).toBe(productsFromJson[0].variants[0].sku);
    });

    it('should reject empty file with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(''), 'empty.csv')
        .expect(400);

      expect(res.body.message).toBe('File is empty');
    });

    it('should reject request without file with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .expect(400);

      expect(res.body.message).toBe('File is required');
    });

    it('should enforce multi-tenancy', async () => {
      // Merchant A imports
      await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(validCsv), 'catalog.csv')
        .expect(200);

      // Merchant B imports
      await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyB}`)
        .attach('file', Buffer.from(validCsv), 'catalog.csv')
        .expect(200);

      // Each merchant should have their own products
      const productsA = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
      });
      const productsB = await prisma.product.findMany({
        where: { merchantId: merchantB.id },
      });

      expect(productsA).toHaveLength(2);
      expect(productsB).toHaveLength(2);
      expect(productsA[0].id).not.toBe(productsB[0].id);
    });

    it('should be idempotent (same file imported twice via import-file)', async () => {
      // First import
      await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(validCsv), 'catalog.csv')
        .expect(200);

      // Second import (same file)
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import-file')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .attach('file', Buffer.from(validCsv), 'catalog.csv')
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        created: 0,
        updated: 2, // Products updated, not duplicated
        errors: [],
      });

      // Verify no duplicates
      const products = await prisma.product.findMany({
        where: { merchantId: merchantA.id },
      });

      expect(products).toHaveLength(2);
    });
  });

  describe('POST /api/catalog/import (AC-05: Deprecation Headers)', () => {
    const validCsv = `name,description,category,sku,price,stock
Test Product,Test description,Test Category,TEST-SKU-001,19.99,5`;

    it('AC-05: should return deprecation headers on JSON import endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog/import')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ csv: validCsv })
        .expect(200);

      expect(res.headers['deprecation']).toBe('version="2026-04"');
      expect(res.headers['link']).toContain('<https://docs.closy.bot/api/catalog-import-file>');
      expect(res.headers['link']).toContain('rel="alternate"');
    });
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      // Seed products for merchant A
      const category = await prisma.category.create({
        data: {
          name: 'Ropa',
          merchantId: merchantA.id,
        },
      });

      await prisma.product.create({
        data: {
          name: 'Camisa Azul',
          categoryId: category.id,
          merchantId: merchantA.id,
          variants: {
            create: {
              sku: 'SKU-001',
              name: 'Talla M',
              price: 29.99,
              stock: 10,
            },
          },
        },
      });

      await prisma.product.create({
        data: {
          name: 'Pantalón Negro',
          categoryId: category.id,
          merchantId: merchantA.id,
          variants: {
            create: {
              sku: 'SKU-002',
              name: 'Talla L',
              price: 49.99,
              stock: 5,
            },
          },
        },
      });
    });

    it('should list all products for authenticated merchant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.data[0].variants).toBeDefined();
    });

    it('should filter by search query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products?q=camisa')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Camisa Azul');
    });

    it('should filter by category', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products?category=Ropa')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });

    it('should enforce multi-tenancy (only show merchant products)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', `Bearer ${apiKeyB}`)
        .expect(200);

      // Merchant B has no products
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('POST /api/products', () => {
    it('should create product with variants', async () => {
      const dto = {
        name: 'Nueva Camisa',
        description: 'Descripción de la camisa',
        categoryName: 'Ropa',
        variants: [
          {
            sku: 'NEW-SKU-001',
            name: 'Talla S',
            price: 25.99,
            stock: 15,
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send(dto)
        .expect(201);

      expect(res.body.name).toBe('Nueva Camisa');
      expect(res.body.variants).toHaveLength(1);
      expect(res.body.merchantId).toBe(merchantA.id);
    });

    it('should create category if it does not exist', async () => {
      const dto = {
        name: 'Producto Nuevo',
        categoryName: 'Nueva Categoría',
        variants: [
          {
            sku: 'NEW-SKU-002',
            name: 'Default',
            price: 10.0,
            stock: 5,
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send(dto)
        .expect(201);

      const category = await prisma.category.findFirst({
        where: { name: 'Nueva Categoría', merchantId: merchantA.id },
      });

      expect(category).toBeDefined();
    });

    it('should reject product without variants', async () => {
      const dto = {
        name: 'Producto Sin Variantes',
        categoryName: 'Ropa',
        variants: [],
      };

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send(dto)
        .expect(400);
    });
  });

  describe('PATCH /api/products/:id', () => {
    let productId: string;

    beforeEach(async () => {
      const category = await prisma.category.create({
        data: {
          name: 'Ropa',
          merchantId: merchantA.id,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'Camisa Original',
          categoryId: category.id,
          merchantId: merchantA.id,
          variants: {
            create: {
              sku: 'SKU-PATCH-001',
              name: 'Talla M',
              price: 29.99,
              stock: 10,
            },
          },
        },
      });

      productId = product.id;
    });

    it('should update product fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ name: 'Camisa Actualizada' })
        .expect(200);

      expect(res.body.name).toBe('Camisa Actualizada');
    });

    it('should reject update from different merchant (multi-tenancy)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${apiKeyB}`)
        .send({ name: 'Camisa Hacked' })
        .expect(404); // Not found (because of multi-tenant isolation)
    });
  });

  describe('DELETE /api/products/:id', () => {
    let productId: string;

    beforeEach(async () => {
      const category = await prisma.category.create({
        data: {
          name: 'Ropa',
          merchantId: merchantA.id,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'Camisa a Borrar',
          categoryId: category.id,
          merchantId: merchantA.id,
          variants: {
            create: {
              sku: 'SKU-DELETE-001',
              name: 'Talla M',
              price: 29.99,
              stock: 10,
            },
          },
        },
      });

      productId = product.id;
    });

    it('should soft delete product', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .expect(200);

      expect(res.body).toEqual({ success: true, id: productId });

      // Verify product is marked inactive
      const product = await prisma.product.findUnique({ where: { id: productId } });
      expect(product?.isActive).toBe(false);
    });

    it('should reject delete from different merchant', async () => {
      await request(app.getHttpServer())
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${apiKeyB}`)
        .expect(404);
    });
  });

  // ============================================================================
  // PR-FE-04.1: PATCH /api/product-variants/:id — Inline Edit
  // ============================================================================

  describe('PATCH /api/product-variants/:id (AC-02, AC-03)', () => {
    let variantId: string;

    beforeEach(async () => {
      const category = await prisma.category.create({
        data: {
          name: 'Ropa',
          merchantId: merchantA.id,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'Camiseta Premium',
          categoryId: category.id,
          merchantId: merchantA.id,
          variants: {
            create: {
              sku: 'CAM-PRM-M',
              name: 'M',
              price: 25000,
              stock: 12,
            },
          },
          include: { variants: true },
        },
        include: { variants: true },
      });

      variantId = product.variants[0].id;
    });

    it('AC-02: should update variant price with valid session', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ price: 30000 })
        .expect(200);

      expect(parseFloat(res.body.price)).toBe(30000);
      expect(res.body.id).toBe(variantId);

      // Verify persisted in DB
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(parseFloat(String(variant?.price))).toBe(30000);
    });

    it('AC-02: should update variant stock', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ stock: 8 })
        .expect(200);

      expect(res.body.stock).toBe(8);

      // Verify persisted in DB
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(variant?.stock).toBe(8);
    });

    it('AC-02: should update price and stock together (partial update)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ price: 35000, stock: 15 })
        .expect(200);

      expect(parseFloat(res.body.price)).toBe(35000);
      expect(res.body.stock).toBe(15);
    });

    it('AC-02: should return full variant object on success', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ price: 30000 })
        .expect(200);

      expect(res.body).toMatchObject({
        id: variantId,
        sku: 'CAM-PRM-M',
        name: 'M',
        stock: 12,
      });
    });

    it('AC-03: should return 404 if variant belongs to different merchant', async () => {
      // Merchant B tries to update a variant owned by Merchant A
      await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyB}`)
        .send({ price: 99999 })
        .expect(404);

      // Verify price was NOT changed
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(parseFloat(String(variant?.price))).toBe(25000);
    });

    it('AC-03: should return 404 for non-existent variant ID', async () => {
      await request(app.getHttpServer())
        .patch('/api/product-variants/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ price: 30000 })
        .expect(404);
    });

    it('should return 401 without session/API key', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .send({ price: 30000 })
        .expect(401);
    });

    it('should return 400 with negative price', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ price: -100 })
        .expect(400);
    });

    it('should return 400 with float stock', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ stock: 2.5 })
        .expect(400);
    });

    it('should return 400 with negative stock', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-variants/${variantId}`)
        .set('Authorization', `Bearer ${apiKeyA}`)
        .send({ stock: -5 })
        .expect(400);
    });
  });
});
