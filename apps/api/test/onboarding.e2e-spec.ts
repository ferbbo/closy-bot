/**
 * PR-OB-01: Onboarding Wizard API E2E Tests
 *
 * AC-04: POST /onboarding/apply-preset aplica PlaybookConfig de industria
 * AC-05: POST /onboarding/apply-preset aplica MerchantConfig defaults
 * AC-06: POST /onboarding/activate rechaza sin requisitos mínimos
 * AC-07: POST /onboarding/activate cambia status a 'active'
 * AC-11: Flujo completo: apply-preset → progress → activate
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { Industry, MerchantStatus } from '@prisma/client';

const TEST_PREFIX = 'test-ob01';

describe('Onboarding Wizard API (e2e) — PR-OB-01', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let merchant: any;
  let sessionId: string;

  // ──────────────────────────────────────────────────────────────────────────
  // Setup / Teardown
  // ──────────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean up previous test data
    await prisma.session.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.merchantConfig.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.product.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.channel.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.merchant.deleteMany({
      where: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } },
    });

    // Create a fresh merchant in onboarding status
    const ts = Date.now();
    merchant = await prisma.merchant.create({
      data: {
        name: 'PR-OB-01 Test Store',
        whatsappNumber: `${TEST_PREFIX}-${ts}`,
        apiKey: `${TEST_PREFIX}-api-${ts}`,
        industry: null,
        status: MerchantStatus.onboarding,
      },
    });

    const session = await prisma.session.create({
      data: {
        sessionId: `${TEST_PREFIX}-session-${ts}`,
        merchantId: merchant.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionId = session.sessionId;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.session.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.merchantConfig.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.product.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.channel.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } } },
    });
    await prisma.merchant.deleteMany({
      where: { whatsappNumber: { startsWith: `${TEST_PREFIX}-` } },
    });
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /onboarding/progress
  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /onboarding/progress', () => {
    it('should return 401 without session cookie', async () => {
      const res = await request(app.getHttpServer()).get('/onboarding/progress').expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('AC-01: should return progress with all steps pending for new merchant', async () => {
      const res = await request(app.getHttpServer())
        .get('/onboarding/progress')
        .set('Cookie', `session_id=${sessionId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        completedSteps: expect.any(Array),
        pendingSteps: expect.any(Array),
        percentage: expect.any(Number),
        nextStep: expect.anything(),
      });
      // New merchant has no industry, no channel, no products → profile/channel/catalog pending
      expect(res.body.pendingSteps).toContain('channel');
      expect(res.body.pendingSteps).toContain('catalog');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /onboarding/apply-preset
  // ──────────────────────────────────────────────────────────────────────────

  describe('POST /onboarding/apply-preset', () => {
    it('should return 401 without session cookie', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/apply-preset')
        .send({ industry: 'ropa' })
        .expect(401);
    });

    it('should return 400 for invalid industry', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/apply-preset')
        .set('Cookie', `session_id=${sessionId}`)
        .send({ industry: 'invalid_industry' })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('AC-04: should apply ropa preset and update Merchant.industry', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/apply-preset')
        .set('Cookie', `session_id=${sessionId}`)
        .send({ industry: 'ropa' })
        .expect(200);

      const updated = await prisma.merchant.findUnique({ where: { id: merchant.id } });
      expect(updated!.industry).toBe(Industry.ropa);
      expect(updated!.playbookConfig).not.toBeNull();
    });

    it('AC-05: should create MerchantConfig with defaults after applying preset', async () => {
      const config = await prisma.merchantConfig.findUnique({
        where: { merchantId: merchant.id },
      });

      expect(config).not.toBeNull();
      const paymentMethods = config!.paymentMethods as unknown[];
      expect(Array.isArray(paymentMethods)).toBe(true);
      expect(paymentMethods.length).toBeGreaterThan(0);
    });

    it('AC-04: idempotent — applying same preset twice returns 200', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/apply-preset')
        .set('Cookie', `session_id=${sessionId}`)
        .send({ industry: 'ropa' })
        .expect(200);

      // Verify merchant still has the same industry
      const updated = await prisma.merchant.findUnique({ where: { id: merchant.id } });
      expect(updated!.industry).toBe(Industry.ropa);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /onboarding/activate
  // ──────────────────────────────────────────────────────────────────────────

  describe('POST /onboarding/activate', () => {
    it('should return 401 without session cookie', async () => {
      await request(app.getHttpServer()).post('/onboarding/activate').expect(401);
    });

    it('AC-06: should return 400 when missing channel (hard requirement)', async () => {
      // Merchant has preset applied (config+playbookConfig) but no channel or product
      const res = await request(app.getHttpServer())
        .post('/onboarding/activate')
        .set('Cookie', `session_id=${sessionId}`)
        .expect(400);

      expect(res.body).toMatchObject({
        error: 'Missing requirements',
        details: expect.arrayContaining(['channel', 'catalog']),
      });
    });

    it('AC-07: should activate merchant when all hard requirements met', async () => {
      // Setup: add channel + product (catalog requirement)
      await prisma.channel.create({
        data: {
          merchantId: merchant.id,
          type: 'WHATSAPP',
          displayName: 'Test Channel',
          phoneNumberId: `test-phone-${Date.now()}`,
          wabaId: `test-waba-${Date.now()}`,
          isActive: true,
          status: 'connected',
        },
      });

      const category = await prisma.category.create({
        data: {
          merchantId: merchant.id,
          name: 'Test Category',
        },
      });

      await prisma.product.create({
        data: {
          merchantId: merchant.id,
          categoryId: category.id,
          name: 'Test Product',
          sku: `TEST-${Date.now()}`,
          isActive: true,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/onboarding/activate')
        .set('Cookie', `session_id=${sessionId}`)
        .expect(200);

      expect(res.body).toMatchObject({ activated: true, status: 'active' });

      // Verify DB state
      const updated = await prisma.merchant.findUnique({ where: { id: merchant.id } });
      expect(updated!.status).toBe(MerchantStatus.active);
    });

    it('AC-07: idempotent — activating already active merchant returns 200 no-op', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/activate')
        .set('Cookie', `session_id=${sessionId}`)
        .expect(200);

      expect(res.body).toMatchObject({ activated: true, status: 'active' });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-11: Flujo completo de onboarding
  // ──────────────────────────────────────────────────────────────────────────

  describe('AC-11: Flujo completo onboarding', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let newMerchant: any;
    let newSessionId: string;

    beforeAll(async () => {
      const ts = Date.now();
      newMerchant = await prisma.merchant.create({
        data: {
          name: 'E2E Full Flow Store',
          whatsappNumber: `${TEST_PREFIX}-full-${ts}`,
          apiKey: `${TEST_PREFIX}-api-full-${ts}`,
          status: MerchantStatus.onboarding,
        },
      });

      const session = await prisma.session.create({
        data: {
          sessionId: `${TEST_PREFIX}-session-full-${ts}`,
          merchantId: newMerchant.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      newSessionId = session.sessionId;
    });

    it('AC-11: should complete full onboarding flow', async () => {
      // Step 1: Check initial progress (all pending)
      const initial = await request(app.getHttpServer())
        .get('/onboarding/progress')
        .set('Cookie', `session_id=${newSessionId}`)
        .expect(200);

      expect(initial.body.percentage).toBe(0);

      // Step 2: Apply preset
      await request(app.getHttpServer())
        .post('/onboarding/apply-preset')
        .set('Cookie', `session_id=${newSessionId}`)
        .send({ industry: 'belleza' })
        .expect(200);

      // Step 3: Setup channel + catalog
      await prisma.channel.create({
        data: {
          merchantId: newMerchant.id,
          type: 'WHATSAPP',
          displayName: 'Belleza Channel',
          phoneNumberId: `bz-phone-${Date.now()}`,
          wabaId: `bz-waba-${Date.now()}`,
          isActive: true,
          status: 'connected',
        },
      });

      const cat = await prisma.category.create({
        data: { merchantId: newMerchant.id, name: 'Productos' },
      });
      await prisma.product.create({
        data: {
          merchantId: newMerchant.id,
          categoryId: cat.id,
          name: 'Serum Vitamina C',
          sku: `BZ-SKU-${Date.now()}`,
          isActive: true,
        },
      });

      // Step 4: Check progress (channel + catalog + config should be complete)
      const midProgress = await request(app.getHttpServer())
        .get('/onboarding/progress')
        .set('Cookie', `session_id=${newSessionId}`)
        .expect(200);

      expect(midProgress.body.completedSteps).toContain('channel');
      expect(midProgress.body.completedSteps).toContain('catalog');
      expect(midProgress.body.completedSteps).toContain('config');

      // Step 5: Activate
      const activateRes = await request(app.getHttpServer())
        .post('/onboarding/activate')
        .set('Cookie', `session_id=${newSessionId}`)
        .expect(200);

      expect(activateRes.body).toMatchObject({ activated: true, status: 'active' });

      // Verify final status
      const updated = await prisma.merchant.findUnique({ where: { id: newMerchant.id } });
      expect(updated!.status).toBe(MerchantStatus.active);
      expect(updated!.industry).toBe(Industry.belleza);
    });
  });
});
