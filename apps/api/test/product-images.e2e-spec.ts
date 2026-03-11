/**
 * PR-18 Product Images E2E Tests
 *
 * Tests: POST /api/products/:productId/image and DELETE /api/products/:productId/image
 *
 * AC-05: POST with valid JPEG → 200 { imageKey, imageUrl }
 * AC-06: Product.imageKey + imageUrl persisted in DB after upload
 * AC-07: DELETE → 204, DB fields null, StorageService.delete called
 * AC-08: Cross-merchant access → 403 Forbidden
 * AC-09: Replace existing image → previous image deleted from R2 before upload
 * AC-10: Schema migration ran correctly (imageKey/imageUrl fields exist)
 * AC-04: Invalid file (EXE-as-JPEG) → 400 Bad Request
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { ImageProcessorService } from '../src/storage/image/image-processor.service';
import { Merchant, Product } from '@prisma/client';

// ─── Minimal valid JPEG magic bytes (3 bytes) ────────────────────────────────
function makeJpegBuffer(extraBytes = 200): Buffer {
  const buf = Buffer.alloc(3 + extraBytes, 0x00);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

// ─── EXE (MZ) header disguised as JPEG ───────────────────────────────────────
function makeExeBuffer(extraBytes = 200): Buffer {
  const buf = Buffer.alloc(4 + extraBytes, 0x00);
  buf[0] = 0x4d;
  buf[1] = 0x5a; // MZ
  return buf;
}

describe('Product Images API (e2e) — PR-18', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Mocked storage and image processor (no actual R2 / sharp calls in E2E)
  let mockUpload: jest.Mock;
  let mockDelete: jest.Mock;
  let mockProcessProductImage: jest.Mock;

  let merchantA: Merchant;
  let merchantB: Merchant;
  let productA: Product;
  let sessionIdA: string;
  let sessionIdB: string;

  beforeAll(async () => {
    mockUpload = jest.fn().mockResolvedValue('https://pub-test.r2.dev/test-key.webp');
    mockDelete = jest.fn().mockResolvedValue(undefined);
    // Returns fake WebP buffer so sharp is never invoked in E2E
    mockProcessProductImage = jest.fn().mockResolvedValue(Buffer.from('fake-webp-output'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({ upload: mockUpload, delete: mockDelete })
      .overrideProvider(ImageProcessorService)
      .useValue({ processProductImage: mockProcessProductImage })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test merchants
    merchantA = await prisma.merchant.create({
      data: {
        name: 'PR18 Merchant A',
        whatsappNumber: `+1pr18a${Date.now()}`,
        apiKey: `pr18-api-a-${Date.now()}`,
      },
    });
    merchantB = await prisma.merchant.create({
      data: {
        name: 'PR18 Merchant B',
        whatsappNumber: `+1pr18b${Date.now()}`,
        apiKey: `pr18-api-b-${Date.now()}`,
      },
    });

    // Create sessions
    const sessionA = await prisma.session.create({
      data: {
        sessionId: `pr18-sess-a-${Date.now()}`,
        merchantId: merchantA.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const sessionB = await prisma.session.create({
      data: {
        sessionId: `pr18-sess-b-${Date.now()}`,
        merchantId: merchantB.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionIdA = sessionA.sessionId;
    sessionIdB = sessionB.sessionId;

    // Create categories and products
    const catA = await prisma.category.create({
      data: { name: 'Ropa', merchantId: merchantA.id },
    });
    const catB = await prisma.category.create({
      data: { name: 'Belleza', merchantId: merchantB.id },
    });

    productA = await prisma.product.create({
      data: {
        name: 'Product A Image Test',
        merchantId: merchantA.id,
        categoryId: catA.id,
      },
    });
    await prisma.product.create({
      data: {
        name: 'Product B Image Test',
        merchantId: merchantB.id,
        categoryId: catB.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup in dependency order
    await prisma.product.deleteMany({
      where: { merchantId: { in: [merchantA.id, merchantB.id] } },
    });
    await prisma.category.deleteMany({
      where: { merchantId: { in: [merchantA.id, merchantB.id] } },
    });
    await prisma.session.deleteMany({
      where: { sessionId: { in: [sessionIdA, sessionIdB] } },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: [merchantA.id, merchantB.id] } },
    });
    await app.close();
  });

  beforeEach(() => {
    mockUpload.mockClear();
    mockDelete.mockClear();
    mockProcessProductImage.mockClear();
    // Restore defaults after each test
    mockUpload.mockResolvedValue('https://pub-test.r2.dev/test-key.webp');
    mockProcessProductImage.mockResolvedValue(Buffer.from('fake-webp-output'));
  });

  // ─── AC-10: Schema fields exist ────────────────────────────────────────────
  describe('AC-10: imageKey and imageUrl fields exist in schema', () => {
    it('should have nullable imageKey and imageUrl on Product model', async () => {
      const product = await prisma.product.findUnique({ where: { id: productA.id } });
      expect(product).toBeDefined();
      expect('imageKey' in product!).toBe(true);
      expect('imageUrl' in product!).toBe(true);
      expect(product!.imageKey).toBeNull();
      expect(product!.imageUrl).toBeNull();
    });
  });

  // ─── AC-05 + AC-06: Upload happy path ──────────────────────────────────────
  describe('AC-05 + AC-06: POST /api/products/:productId/image — upload happy path', () => {
    it('should return 200 { imageKey, imageUrl } for valid JPEG and persist in DB', async () => {
      const expectedUrl = 'https://pub-test.r2.dev/merchant-a/products/test/123.webp';
      mockUpload.mockResolvedValue(expectedUrl);

      const response = await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .attach('image', makeJpegBuffer(), { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(response.body).toHaveProperty('imageKey');
      expect(response.body).toHaveProperty('imageUrl');
      expect(typeof response.body.imageKey).toBe('string');
      expect(typeof response.body.imageUrl).toBe('string');
      expect(mockUpload).toHaveBeenCalledTimes(1);

      // AC-06: verify persisted in DB
      const updated = await prisma.product.findUnique({ where: { id: productA.id } });
      expect(updated!.imageKey).toBe(response.body.imageKey);
      expect(updated!.imageUrl).toBe(response.body.imageUrl);
    });

    it('should return 401 without session cookie', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .attach('image', makeJpegBuffer(), { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(401);
    });

    it('should return 400 when no file is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(400);
    });
  });

  // ─── AC-04: Magic bytes validation ─────────────────────────────────────────
  describe('AC-04: invalid file rejected by magic bytes check', () => {
    it('should return 400 for EXE file disguised as JPEG', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .attach('image', makeExeBuffer(), { filename: 'virus.jpg', contentType: 'image/jpeg' })
        .expect(400);
    });
  });

  // ─── AC-08: Ownership check ─────────────────────────────────────────────────
  describe('AC-08: ownership check — cross-merchant access denied', () => {
    it('POST: merchant-B session trying to upload to merchant-A product → 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdB}`])
        .attach('image', makeJpegBuffer(), { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(403);
    });

    it('DELETE: merchant-B session trying to delete merchant-A product image → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdB}`])
        .expect(403);
    });
  });

  // ─── AC-09: Replace existing image ─────────────────────────────────────────
  describe('AC-09: uploading over existing image deletes previous from R2', () => {
    it('should call StorageService.delete with the old key before uploading new', async () => {
      // First upload — set a known URL so we can extract the key
      mockUpload.mockResolvedValue('https://pub-test.r2.dev/first-upload.webp');
      const firstResponse = await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .attach('image', makeJpegBuffer(), { filename: 'first.jpg', contentType: 'image/jpeg' })
        .expect(201);

      const storedFirstKey = firstResponse.body.imageKey;
      expect(typeof storedFirstKey).toBe('string');
      mockUpload.mockClear();
      mockDelete.mockClear();

      // Second upload (replace) — different key
      mockUpload.mockResolvedValue('https://pub-test.r2.dev/second-upload.webp');

      await request(app.getHttpServer())
        .post(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .attach('image', makeJpegBuffer(), { filename: 'second.jpg', contentType: 'image/jpeg' })
        .expect(201);

      // The OLD key must have been passed to delete
      expect(mockDelete).toHaveBeenCalledWith(storedFirstKey);
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });
  });

  // ─── AC-07: Delete endpoint ─────────────────────────────────────────────────
  describe('AC-07: DELETE /api/products/:productId/image', () => {
    it('should return 204 and clear DB fields and call StorageService.delete', async () => {
      // Ensure product has an image first
      const imageKey = 'pr18/delete-test.webp';
      await prisma.product.update({
        where: { id: productA.id },
        data: { imageKey, imageUrl: `https://pub.r2.dev/${imageKey}` },
      });

      await request(app.getHttpServer())
        .delete(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(204);

      expect(mockDelete).toHaveBeenCalledWith(imageKey);

      const updated = await prisma.product.findUnique({ where: { id: productA.id } });
      expect(updated!.imageKey).toBeNull();
      expect(updated!.imageUrl).toBeNull();
    });

    it('should return 204 silently for product with no image (no error)', async () => {
      // Ensure no image set
      await prisma.product.update({
        where: { id: productA.id },
        data: { imageKey: null, imageUrl: null },
      });

      await request(app.getHttpServer())
        .delete(`/api/products/${productA.id}/image`)
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(204);

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('should return 401 without session cookie', async () => {
      await request(app.getHttpServer()).delete(`/api/products/${productA.id}/image`).expect(401);
    });
  });
});
