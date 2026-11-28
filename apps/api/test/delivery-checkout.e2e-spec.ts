import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { DELIVERY_LLM_PROVIDER } from '../src/verticals/delivery/agent/delivery-agent.service';
import { FakeLlmProvider } from './utils/fake-llm.provider';
import { FakeGraphApi } from './meta-sandbox/fake-graph-api';
import { applySandboxEnv } from './meta-sandbox/env';
import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import { inboundText, signPayload } from './meta-sandbox/webhook-builders';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

/**
 * S3.3-T3 — Checkout conversacional: pedido natural → entrega + pago en un mensaje →
 * resumen exacto → "dale" → Order + comanda + plantilla de confirmación + POS skipped.
 * AC-14, AC-15, AC-30, AC-32, AC-37.
 */
describe('Delivery checkout (e2e)', () => {
  const MERCHANT_ID = 'dlv_merchant_burger_barrio'; // prisma/seed-delivery.ts
  const customerPhone = SANDBOX_APP.customers[0];
  const graph = new FakeGraphApi();
  const fake = new FakeLlmProvider([]);
  let app: INestApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;
  const prev = { mode: process.env.FEATURES_MODE, enabled: process.env.DELIVERY_ENABLED };
  const v: Record<string, string> = {};

  const send = async (text: string): Promise<string> => {
    const raw = JSON.stringify(inboundText(customerPhone, text));
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200);
    const last = await prisma.outboxMessage.findFirst({
      where: { merchantId: MERCHANT_ID, type: 'SEND_TEXT' },
      orderBy: { createdAt: 'desc' },
    });
    return String((last?.payloadJson as { text?: string } | null)?.text ?? '');
  };
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

  it('AC-32 + AC-14 + AC-15 + AC-30 + AC-37: order → delivery & payment in one message → summary → "dale" → confirmed order', async () => {
    fake.enqueue(
      {
        toolCalls: [
          { name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } },
          { name: 'buscar_producto', arguments: { query: 'coca' } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'agregar_al_carrito',
            arguments: { variantId: v['HAM-SEN'], cantidad: 2, notas: 'sin cebolla' },
          },
          { name: 'agregar_al_carrito', arguments: { variantId: v['BEB-COCA-400'], cantidad: 1 } },
        ],
      },
      { text: 'Listo, van $36.000. ¿A qué dirección te lo enviamos?' },
    );
    await send('me mandas 2 hamburguesas sencillas sin cebolla y una coca de 400');

    // One message with address, neighborhood and payment (AC-32): no follow-up questions needed
    fake.enqueue(
      {
        toolCalls: [
          {
            name: 'fijar_entrega',
            arguments: {
              direccion: 'Cra 27 #45-12',
              barrio: 'cabecera',
              referencia: 'frente al parque',
            },
          },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      {
        toolCalls: [
          { name: 'fijar_pago', arguments: { metodo: 'cod', pagaCon: '50' } },
          { name: 'resumen_pedido', arguments: {} },
        ],
      },
      { text: 'Perfecto, a Cabecera el domicilio vale $4.000. Te dejo el resumen, ¿lo confirmo?' },
    );
    const summaryReply = await send(
      'a la cra 27 #45-12 en cabecera, frente al parque. pago en efectivo con 50',
    );
    expect(summaryReply).toMatch(/Total \.+ \$40\.000/);
    expect(summaryReply).toContain('2× Hamburguesa sencilla (sin cebolla)');
    expect(summaryReply).toContain('Efectivo · cambio de $50.000');
    // AC-14: before the "yes" there is no Order
    expect(await prisma.order.count({ where: { merchantId: MERCHANT_ID } })).toBe(0);

    const conv = await prisma.conversation.findFirstOrThrow({ where: { merchantId: MERCHANT_ID } });
    const token = (conv.metadata as { delivery: { checkout: { summary: { token: string } } } })
      .delivery.checkout.summary.token;

    fake.enqueue(
      { toolCalls: [{ name: 'confirmar_pedido', arguments: { confirmationToken: token } }] },
      { text: '¡Listo! Tu pedido ya está en cocina 🍔' },
    );
    await send('dale');

    const order = await prisma.order.findFirstOrThrow({
      where: { merchantId: MERCHANT_ID },
      include: { items: true },
    });
    expect(order.status).toBe('confirmed');
    expect(order.confirmedAt).toBeInstanceOf(Date);
    expect(Number(order.totalAmount)).toBe(40000);
    expect(Number(order.shippingCost)).toBe(4000);
    expect(order.deliveryZone).toBe('Cabecera');
    expect(Number(order.cashChangeFor)).toBe(50000);
    expect(order.items.find((i) => i.variantId === v['HAM-SEN'])?.notes).toBe('sin cebolla');
    expect(
      await prisma.cart.count({ where: { merchantId: MERCHANT_ID, status: 'completed' } }),
    ).toBe(1);
    // AC-30: provider none → skipped, no external calls
    expect(order.posSyncStatus).toBe('skipped');

    const outbox = await prisma.outboxMessage.findMany({ where: { merchantId: MERCHANT_ID } });
    // AC-15 / AC-37: exactly one comanda to the merchant (template mode: items in one line)
    const kitchen = outbox.filter((m) => m.dedupeKey === `order:${order.id}:kitchen`);
    expect(kitchen).toHaveLength(1);
    expect(kitchen[0].type).toBe('SEND_TEMPLATE');
    expect(JSON.stringify(kitchen[0].payloadJson)).toContain('comanda_nuevo_pedido');
    // confirmation template to the customer
    const confirmed = outbox.find((m) => m.dedupeKey === `order:${order.id}:status:confirmed`);
    expect(JSON.stringify(confirmed?.payloadJson)).toContain('pedido_confirmado');
  });

  it('AC-14: confirmar_pedido without a previous summary is rejected and no order is created', async () => {
    const before = await prisma.order.count({ where: { merchantId: MERCHANT_ID } });
    fake.enqueue(
      { toolCalls: [{ name: 'confirmar_pedido', arguments: { confirmationToken: 'made-up' } }] },
      { text: 'Primero te muestro el resumen.' },
    );
    await send('sí, confírmalo');
    expect(await prisma.order.count({ where: { merchantId: MERCHANT_ID } })).toBe(before);
  });
});
