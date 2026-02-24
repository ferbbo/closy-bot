/**
 * PR-04.5: MerchantConfig E2E Tests
 * AC-08: GET /merchants/me/config returns 200 + config
 * AC-09: PATCH /merchants/me/config updates only sent fields
 * AC-12: Multi-tenancy — merchant cannot access another merchant's config
 * AC-03: paymentMethods validates types (invalid type → 400)
 * AC-04: shippingConfig validates flatRate type
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { Industry } from '@prisma/client';

describe('MerchantConfig (e2e) — PR-04.5', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Merchant A
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let merchantA: any;
  let sessionIdA: string;

  // Merchant B (for multi-tenancy tests)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let merchantB: any;
  let sessionIdB: string;

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

    // Clean up any previous test data
    await prisma.session.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: 'test-pr04.5-' } } },
    });
    await prisma.merchantConfig.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: 'test-pr04.5-' } } },
    });
    await prisma.merchant.deleteMany({
      where: { whatsappNumber: { startsWith: 'test-pr04.5-' } },
    });

    // Create merchant A (ropa)
    merchantA = await prisma.merchant.create({
      data: {
        name: 'PR04.5 Merchant A',
        whatsappNumber: `test-pr04.5-a-${Date.now()}`,
        apiKey: `test-api-pr045-a-${Date.now()}`,
        industry: Industry.ropa,
      },
    });

    const sessionA = await prisma.session.create({
      data: {
        sessionId: `test-session-pr045-a-${Date.now()}`,
        merchantId: merchantA.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionIdA = sessionA.sessionId;

    // Create merchant B (belleza) — for multi-tenancy test
    merchantB = await prisma.merchant.create({
      data: {
        name: 'PR04.5 Merchant B',
        whatsappNumber: `test-pr04.5-b-${Date.now()}`,
        apiKey: `test-api-pr045-b-${Date.now()}`,
        industry: Industry.belleza,
      },
    });

    const sessionB = await prisma.session.create({
      data: {
        sessionId: `test-session-pr045-b-${Date.now()}`,
        merchantId: merchantB.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionIdB = sessionB.sessionId;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: 'test-pr04.5-' } } },
    });
    await prisma.merchantConfig.deleteMany({
      where: { merchant: { whatsappNumber: { startsWith: 'test-pr04.5-' } } },
    });
    await prisma.merchant.deleteMany({
      where: { whatsappNumber: { startsWith: 'test-pr04.5-' } },
    });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // AC-08: GET /merchants/me/config
  // ---------------------------------------------------------------------------

  describe('AC-08: GET /merchants/me/config', () => {
    it('returns 401 without session', async () => {
      await request(app.getHttpServer()).get('/merchants/me/config').expect(401);
    });

    it('returns 200 + config with ropa preset for merchant A (auto-creates)', async () => {
      const res = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(200);

      expect(res.body).toMatchObject({
        merchantId: merchantA.id,
        currency: 'COP',
        orderCodePrefix: 'ORD',
        autoConfirmCod: true,
      });
      expect(res.body.paymentMethods).toBeInstanceOf(Array);
      expect(res.body.paymentMethods.length).toBeGreaterThanOrEqual(2);
      expect(res.body.shippingConfig).toBeDefined();
    });

    it('returns same config on second GET (idempotent)', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(200);

      const res2 = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(200);

      expect(res1.body.id).toBe(res2.body.id);
    });

    it('merchant B gets belleza preset (ORDEN prefix)', async () => {
      const res = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdB}`])
        .expect(200);

      expect(res.body.orderCodePrefix).toBe('ORDEN');
      expect(res.body.paymentMethods.some((m: { type: string }) => m.type === 'payment_link')).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09: PATCH /merchants/me/config — partial update
  // ---------------------------------------------------------------------------

  describe('AC-09: PATCH /merchants/me/config — partial update', () => {
    it('updates only returnPolicy when only returnPolicy is sent', async () => {
      const newPolicy = 'Política actualizada por test e2e';

      const res = await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .send({ returnPolicy: newPolicy })
        .expect(200);

      expect(res.body.returnPolicy).toBe(newPolicy);
      // Other fields unchanged
      expect(res.body.orderCodePrefix).toBe('ORD');
      expect(res.body.currency).toBe('COP');
      expect(res.body.autoConfirmCod).toBe(true);
    });

    it('updates paymentMethods with new methods', async () => {
      const newMethods = [
        { type: 'cod', label: 'Efectivo' },
        {
          type: 'transfer',
          label: 'Bancolombia',
          bankInfo: {
            bankName: 'Bancolombia',
            accountNumber: '1234567890',
            accountType: 'ahorros',
            accountHolder: 'Mi Tienda',
          },
        },
      ];

      const res = await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .send({ paymentMethods: newMethods })
        .expect(200);

      expect(res.body.paymentMethods).toHaveLength(2);
      expect(res.body.paymentMethods[1].bankInfo).toBeDefined();
      // returnPolicy unchanged from previous test
      expect(res.body.returnPolicy).toBe('Política actualizada por test e2e');
    });

    it('updates autoConfirmCod to false', async () => {
      const res = await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .send({ autoConfirmCod: false })
        .expect(200);

      expect(res.body.autoConfirmCod).toBe(false);
    });

    it('returns 401 without session', async () => {
      await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .send({ currency: 'USD' })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-03: paymentMethods validation
  // ---------------------------------------------------------------------------

  describe('AC-03: paymentMethods DTO validation', () => {
    it('returns 400 when paymentMethod has invalid type', async () => {
      const res = await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .send({
          paymentMethods: [{ type: 'bitcoin', label: 'Cripto' }],
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-04: shippingConfig validation
  // ---------------------------------------------------------------------------

  describe('AC-04: shippingConfig DTO validation', () => {
    it('returns 400 when flatRate is a string instead of number', async () => {
      const res = await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .send({
          shippingConfig: { flatRate: 'gratis', estimatedDays: '3 días' },
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-12: Multi-tenancy — each merchant only sees their own config
  // ---------------------------------------------------------------------------

  describe('AC-12: Multi-tenancy isolation', () => {
    it('merchant A config has ropa prefix, merchant B has belleza prefix', async () => {
      const resA = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdB}`])
        .expect(200);

      // Each merchant sees only their own config
      expect(resA.body.merchantId).toBe(merchantA.id);
      expect(resB.body.merchantId).toBe(merchantB.id);

      // Configs are different (different presets)
      expect(resA.body.id).not.toBe(resB.body.id);
    });

    it("PATCH by merchant A does not affect merchant B's config", async () => {
      // Get initial currency of B
      const initialB = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdB}`])
        .expect(200);

      // Merchant A changes their currency
      await request(app.getHttpServer())
        .patch('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdA}`])
        .send({ currency: 'USD' })
        .expect(200);

      // Merchant B currency unchanged
      const afterB = await request(app.getHttpServer())
        .get('/merchants/me/config')
        .set('Cookie', [`session_id=${sessionIdB}`])
        .expect(200);

      expect(afterB.body.currency).toBe(initialB.body.currency);
    });
  });
});
