import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { DELIVERY_LLM_PROVIDER } from '../src/verticals/delivery/agent/delivery-agent.service';
import { IMAGE_INTERPRETER, MEDIA_FETCHER } from '../src/verticals/delivery/contracts';
import { PHOTO_TEXTS } from '../src/verticals/delivery/media/product-photo.service';
import { RECEIPT_TEXTS } from '../src/verticals/delivery/media/receipt.service';
import { FakeLlmProvider } from './utils/fake-llm.provider';
import { FakeImageInterpreter, FakeMediaFetcher } from './utils/fake-media';
import { FakeGraphApi } from './meta-sandbox/fake-graph-api';
import { applySandboxEnv } from './meta-sandbox/env';
import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import { inboundImage, inboundText, signPayload } from './meta-sandbox/webhook-builders';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

/**
 * S5.3-T4 — Imagen de punta a punta: webhook firmado (image) → MediaRouter → FakeImageInterpreter
 * → CatalogMatcher / ReceiptForwarder → agente (FakeLlmProvider) → BD. AC-31, AC-27.
 * Sin Groq ni Graph API reales (FakeMediaFetcher + FakeImageInterpreter + FakeGraphApi).
 */
describe('Delivery media: image (e2e)', () => {
  const MERCHANT_ID = 'dlv_merchant_burger_barrio'; // prisma/seed-delivery.ts
  const customerPhone = SANDBOX_APP.customers[1];
  const graph = new FakeGraphApi();
  const fake = new FakeLlmProvider([]);
  const interpreter = new FakeImageInterpreter({ ok: false, reason: 'UNSUPPORTED' });
  const fetcher = new FakeMediaFetcher({
    ok: true,
    value: { buffer: Buffer.from('fake-jpeg'), mimeType: 'image/jpeg', sizeBytes: 9 },
  });
  let app: INestApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;
  const prev = { mode: process.env.FEATURES_MODE, enabled: process.env.DELIVERY_ENABLED };
  const v: Record<string, string> = {};
  let seq = 0;
  const runId = Date.now(); // inbound dedupe by message_id survives the per-merchant cleanup

  const post = async (payload: unknown): Promise<string> => {
    const raw = JSON.stringify(payload);
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200);
    const last = await prisma.outboxMessage.findFirst({
      where: { merchantId: MERCHANT_ID, type: 'SEND_TEXT', conversationId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    return String((last?.payloadJson as { text?: string } | null)?.text ?? '');
  };
  const sendText = (text: string) => post(inboundText(customerPhone, text));
  const sendImage = (caption?: string, id = `wamid.IMG.${runId}.${++seq}`) =>
    post(inboundImage(customerPhone, `media-${seq}`, caption, { id }));
  const cartLines = () =>
    prisma.cartItem.findMany({
      where: { cart: { merchantId: MERCHANT_ID, status: 'active' } },
      include: { variant: true },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    ({ baseUrl: v.base } = await graph.start());
    restoreEnv = applySandboxEnv(v.base);
    process.env.FEATURES_MODE = 'dev';
    process.env.DELIVERY_ENABLED = 'true';

    await promisify(execFile)('npx', ['tsx', 'prisma/seed-delivery.ts'], {
      cwd: resolve(__dirname, '../../..'),
      env: process.env,
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DELIVERY_LLM_PROVIDER)
      .useValue(fake)
      .overrideProvider(IMAGE_INTERPRETER)
      .useValue(interpreter)
      .overrideProvider(MEDIA_FETCHER)
      .useValue(fetcher)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Always open for the test, regardless of the wall clock
    const cfg = await prisma.merchantConfig.findUniqueOrThrow({
      where: { merchantId: MERCHANT_ID },
    });
    const deliveryConfig = cfg.deliveryConfig as Record<string, unknown>;
    deliveryConfig.openingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      open: '00:00',
      close: '23:59',
    }));
    await prisma.merchantConfig.update({
      where: { merchantId: MERCHANT_ID },
      data: { deliveryConfig: deliveryConfig as unknown as Prisma.InputJsonValue },
    });
    await prisma.channel.upsert({
      where: { type_externalId: { type: 'WHATSAPP', externalId: SANDBOX_APP.phoneNumberId } },
      create: {
        merchantId: MERCHANT_ID,
        type: 'WHATSAPP',
        externalId: SANDBOX_APP.phoneNumberId,
        displayName: 'Sandbox',
        credentials: {
          accessToken: SANDBOX_APP.accessToken,
          phoneNumberId: SANDBOX_APP.phoneNumberId,
        },
        wabaId: SANDBOX_APP.wabaId,
        status: 'connected',
      },
      update: { merchantId: MERCHANT_ID },
    });

    const variants = await prisma.productVariant.findMany({
      where: { product: { merchantId: MERCHANT_ID } },
    });
    for (const variant of variants) v[variant.sku] = variant.id;
  });

  afterAll(async () => {
    try {
      const where = { merchantId: MERCHANT_ID };
      await prisma.orderItem.deleteMany({ where: { order: where } });
      await prisma.order.deleteMany({ where });
      await prisma.cartItem.deleteMany({ where: { cart: where } });
      await prisma.cart.deleteMany({ where });
      await prisma.outboxMessage.deleteMany({ where });
      await prisma.messageLog.deleteMany({ where });
      await prisma.handoff.deleteMany({ where: { conversation: where } });
      await prisma.conversation.deleteMany({ where });
      await prisma.productVariant.deleteMany({ where: { product: where } });
      await prisma.product.deleteMany({ where });
      await prisma.category.deleteMany({ where });
      await prisma.merchantConfig.deleteMany({ where });
      await prisma.channel.deleteMany({ where });
      await prisma.merchant.deleteMany({ where: { id: MERCHANT_ID } });
    } finally {
      await app?.close();
      await graph.stop();
      restoreEnv();
      for (const [k, val] of [
        ['FEATURES_MODE', prev.mode],
        ['DELIVERY_ENABLED', prev.enabled],
      ] as const) {
        if (val === undefined) delete process.env[k];
        else process.env[k] = val;
      }
    }
  });

  it('AC-31: product photo → candidates with DB prices, cart untouched; "la primera" → 2 units', async () => {
    interpreter.respondWith({
      kind: 'product',
      items: [{ query: 'hamburguesa tocineta', quantity: 2 }],
      confidence: 'HIGH',
    });
    fake.enqueue(
      {
        toolCalls: [
          { name: 'buscar_producto', arguments: { query: 'hamburguesa tocineta', cantidad: 2 } },
        ],
      },
      {
        text: 'Tengo la Hamburguesa de tocineta a $19.000 😋 ¿Te mando las 2 de esa?',
      },
    );
    const callsBefore = fake.calls.length;
    const reply = await sendImage();

    expect(reply).toContain('📷 En tu foto veo: hamburguesa tocineta ×2');
    expect(reply).toContain('Hamburguesa de tocineta a $19.000');
    expect(await cartLines()).toHaveLength(0);
    // the agent got the synthetic photo text (descriptions only, no prices)
    const firstCall = fake.calls[callsBefore];
    expect(firstCall.method).toBe('generateWithTools');
    const userMsg =
      firstCall.method === 'generateWithTools'
        ? firstCall.request.messages[firstCall.request.messages.length - 1].content
        : '';
    expect(userMsg).toContain('[foto de producto]');
    expect(userMsg).toContain('2 × hamburguesa tocineta');
    expect(userMsg).not.toContain('$');
    // the interpreter never receives prices
    expect(JSON.stringify(interpreter.calls)).not.toMatch(/\$|19\.?000/);
    // lastCandidates keep the suggested quantity (RN-02, TTL 30 min)
    const conv = await prisma.conversation.findFirstOrThrow({ where: { merchantId: MERCHANT_ID } });
    const saved = (conv.metadata as { delivery?: { lastCandidates?: { items?: unknown[] } } })
      .delivery?.lastCandidates?.items as Array<{ variantId: string; suggestedQuantity: number }>;
    expect(saved[0]).toMatchObject({ variantId: v['HAM-TOC'], suggestedQuantity: 2 });

    // Free choice: the id comes from lastCandidates (no new search this turn)
    fake.enqueue(
      {
        toolCalls: [
          { name: 'agregar_al_carrito', arguments: { variantId: v['HAM-TOC'], cantidad: 2 } },
        ],
      },
      { text: '¡Listo! Te anoté las hamburguesas de tocineta. ¿Algo más?' },
    );
    const historyCall = fake.calls.length;
    await sendText('la primera');
    const lines = await cartLines();
    expect(lines.map((l) => [l.variant.sku, l.quantity])).toEqual([['HAM-TOC', 2]]);
    expect(Number(lines[0].priceSnapshot)).toBe(19000);
    // the suggested quantity reached the choosing turn (history note; ctx text stays as typed)
    const call = fake.calls[historyCall];
    const messages = call.method === 'generateWithTools' ? call.request.messages : [];
    expect(JSON.stringify(messages)).toContain('Hamburguesa de tocineta ×2');
    expect(messages[messages.length - 1].content).toBe('la primera');
  });

  it('AC-31: photo without catalog matches → "no encontré" fallback, no LLM call', async () => {
    interpreter.respondWith({
      kind: 'product',
      items: [{ query: 'sushi de salmón', quantity: 1 }],
      confidence: 'MED',
    });
    const calls = fake.calls.length;
    await expect(sendImage()).resolves.toBe(PHOTO_TEXTS.notFound);
    expect(fake.calls.length).toBe(calls);
  });

  it('AC-31: kind other → asks to describe it with text', async () => {
    interpreter.respondWith({ kind: 'other', items: [], confidence: 'LOW' });
    await expect(sendImage()).resolves.toBe(PHOTO_TEXTS.describe);
  });

  it('RN-26: payment_receipt without a pending order → asks which order', async () => {
    interpreter.respondWith({ kind: 'payment_receipt', items: [], confidence: 'HIGH' });
    await expect(sendImage()).resolves.toBe(RECEIPT_TEXTS.whichOrder);
  });

  it('AC-27: receipt with a pending_payment order → manager alert with the code; order stays pending_payment', async () => {
    const { customer } = await prisma.conversation.findFirstOrThrow({
      where: { merchantId: MERCHANT_ID },
      include: { customer: true },
    });
    const order = await prisma.order.create({
      data: {
        orderCode: 'ORD-9042',
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        status: 'pending_payment',
        totalAmount: 38000,
        shippingAddress: 'Cra 27 #45-12',
        customerName: 'Cliente Sandbox',
        customerPhone: customer.phone,
        paymentMethod: 'transfer',
      },
    });
    interpreter.respondWith({ kind: 'payment_receipt', items: [], confidence: 'HIGH' });

    const receiptWamid = `wamid.IMG.${runId}.receipt`;
    const reply = await sendImage(undefined, receiptWamid);

    expect(reply).toBe(RECEIPT_TEXTS.received);
    const alerts = await prisma.outboxMessage.findMany({
      where: { merchantId: MERCHANT_ID, dedupeKey: `order:${order.id}:receipt:${receiptWamid}` },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].to.replace(/\D/g, '')).toBe(SANDBOX_APP.merchantPhone.replace(/\D/g, ''));
    expect(JSON.stringify(alerts[0].payloadJson)).toContain('ORD-9042');
    // AC-27: the bot never confirms a payment from an image
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('pending_payment');

    // Caption-based receipt (vision says other) → same flow, one alert per image
    interpreter.respondWith({ kind: 'other', items: [], confidence: 'LOW' });
    await expect(sendImage('ya pagué, ahí va el comprobante')).resolves.toBe(
      RECEIPT_TEXTS.received,
    );
    const all = await prisma.outboxMessage.count({
      where: { merchantId: MERCHANT_ID, dedupeKey: { startsWith: `order:${order.id}:receipt:` } },
    });
    expect(all).toBe(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'pending_payment',
    );
  });
});
