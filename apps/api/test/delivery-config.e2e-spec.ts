/**
 * S1.2-T4: PATCH /merchants/me/config acepta `deliveryConfig` (Delivery vertical, B2).
 * AC-02: PATCH válido → 200 y persistido; inválido → 400 con el path exacto.
 * Gating: flag apagado (FEATURES_MODE=mvp) → 403; industry≠restaurante → 403.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { FeatureFlagsService } from '../src/common/feature-flags/feature-flags.service';
import { Industry } from '@prisma/client';

const PREFIX = 'test-s12-delivery-';

describe('DeliveryConfig via merchant settings (e2e) — S1.2-T4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let flagSpy: jest.SpyInstance<boolean, []>;
  let restSession: string;
  let ropaSession: string;
  let restMerchantId: string;

  const zone = {
    id: 'cabecera',
    name: 'Cabecera',
    aliases: ['cabecera del llano'],
    fee: 4000,
    minOrder: 15000,
    etaMinutes: 20,
  };

  async function cleanup() {
    const where = { merchant: { whatsappNumber: { startsWith: PREFIX } } };
    await prisma.session.deleteMany({ where });
    await prisma.merchantConfig.deleteMany({ where });
    await prisma.merchant.deleteMany({ where: { whatsappNumber: { startsWith: PREFIX } } });
  }

  async function createMerchant(tag: string, industry: Industry) {
    const merchant = await prisma.merchant.create({
      data: {
        name: `S1.2 ${tag}`,
        whatsappNumber: `${PREFIX}${tag}-${Date.now()}`,
        apiKey: `${PREFIX}api-${tag}-${Date.now()}`,
        industry,
      },
    });
    const session = await prisma.session.create({
      data: {
        sessionId: `${PREFIX}session-${tag}-${Date.now()}`,
        merchantId: merchant.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { merchantId: merchant.id, sessionId: session.sessionId };
  }

  function patch(sessionId: string, body: object) {
    return request(app.getHttpServer())
      .patch('/merchants/me/config')
      .set('Cookie', [`session_id=${sessionId}`])
      .send(body);
  }

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
    await cleanup();

    const rest = await createMerchant('rest', Industry.restaurante);
    restMerchantId = rest.merchantId;
    restSession = rest.sessionId;
    ropaSession = (await createMerchant('ropa', Industry.ropa)).sessionId;
  });

  beforeEach(() => {
    flagSpy = jest
      .spyOn(FeatureFlagsService.prototype, 'isDeliveryEnabled', 'get')
      .mockReturnValue(true);
  });

  afterEach(() => flagSpy.mockRestore());

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('AC-02: PATCH válido → 200, persistido y mezclado con defaults técnicos', async () => {
    const res = await patch(restSession, {
      deliveryConfig: {
        zones: [zone],
        openingHours: [{ day: 5, open: '18:00', close: '02:00' }],
        prepTimeMinutes: 25,
      },
    }).expect(200);

    expect(res.body.deliveryConfig.zones).toEqual([zone]);
    expect(res.body.deliveryConfig.maxLines).toBe(15);

    const row = await prisma.merchantConfig.findUnique({ where: { merchantId: restMerchantId } });
    const stored = row?.deliveryConfig as Record<string, unknown>;
    expect(stored.zones).toEqual([zone]);
    expect(stored.prepTimeMinutes).toBe(25);
    expect(stored.timezone).toBe('America/Bogota');
  });

  it('PATCH parcial posterior conserva lo ya guardado', async () => {
    const res = await patch(restSession, { deliveryConfig: { temporarilyClosed: true } }).expect(
      200,
    );
    expect(res.body.deliveryConfig.temporarilyClosed).toBe(true);
    expect(res.body.deliveryConfig.zones).toEqual([zone]);
  });

  it('AC-02: PATCH inválido → 400 con el path exacto y sin persistir', async () => {
    const res = await patch(restSession, {
      deliveryConfig: { zones: [{ ...zone, fee: -100 }] },
    }).expect(400);

    expect(res.body.errors).toEqual([
      { path: 'deliveryConfig.zones[0].fee', message: expect.any(String) },
    ]);
    expect(res.body.message[0]).toContain('deliveryConfig.zones[0].fee');

    const row = await prisma.merchantConfig.findUnique({ where: { merchantId: restMerchantId } });
    expect((row?.deliveryConfig as { zones: Array<{ fee: number }> }).zones[0].fee).toBe(4000);
  });

  it('400 con path para un campo desconocido', async () => {
    const res = await patch(restSession, { deliveryConfig: { foo: 1 } }).expect(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(['deliveryConfig.foo']);
  });

  it('FEATURES_MODE=mvp (flag apagado) → 403', async () => {
    flagSpy.mockReturnValue(false);
    await patch(restSession, { deliveryConfig: { prepTimeMinutes: 30 } }).expect(403);
  });

  it('comercio no restaurante → 403', async () => {
    await patch(ropaSession, { deliveryConfig: { prepTimeMinutes: 30 } }).expect(403);
  });

  it('retrocompatible: PATCH sin deliveryConfig se comporta igual (flag apagado)', async () => {
    flagSpy.mockReturnValue(false);
    const res = await patch(ropaSession, { autoConfirmCod: false }).expect(200);
    expect(res.body.autoConfirmCod).toBe(false);
    expect(res.body.deliveryConfig).toBeNull();
  });

  it('deliveryConfig: null borra la config guardada', async () => {
    const res = await patch(restSession, { deliveryConfig: null }).expect(200);
    expect(res.body.deliveryConfig).toBeNull();
  });
});
