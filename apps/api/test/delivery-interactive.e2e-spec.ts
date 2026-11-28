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
import {
  buttonReply,
  inboundText,
  signPayload,
  type WebhookPayload,
} from './meta-sandbox/webhook-builders';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

/**
 * S5.4-T2 — Confirmación con botones (F-18, AC-28): el resumen sale como mensaje interactivo
 * con 2 botones (cuerpo = bloque exacto del presenter); el botón "No" no crea Order y el botón
 * "Sí" produce el mismo efecto que AC-14 (Order confirmado, carrito completed, plantilla).
 */
describe('Delivery interactive confirmation (e2e)', () => {
  const MERCHANT_ID = 'dlv_merchant_burger_barrio'; // prisma/seed-delivery.ts
  const customerPhone = SANDBOX_APP.customers[0];
  const graph = new FakeGraphApi();
  const fake = new FakeLlmProvider([]);
  let app: INestApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;
  const prev = { mode: process.env.FEATURES_MODE, enabled: process.env.DELIVERY_ENABLED };
  const v: Record<string, string> = {};

  const post = async (payload: WebhookPayload): Promise<void> => {
    const raw = JSON.stringify(payload);
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200);
  };
  const send = (text: string, id?: string) => post(inboundText(customerPhone, text, { id }));
  const orders = () => prisma.order.count({ where: { merchantId: MERCHANT_ID } });

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

  it('AC-28: summary → interactive with 2 buttons → "No" creates no Order → "Sí" behaves like AC-14', async () => {
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

    fake.enqueue(
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { direccion: 'Cra 27 #45-12', barrio: 'cabecera' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      {
        toolCalls: [
          { name: 'fijar_pago', arguments: { metodo: 'cod', pagaCon: '50' } },
          { name: 'resumen_pedido', arguments: {} },
        ],
      },
      { text: 'Perfecto, el domicilio vale $4.000. Te dejo el resumen, ¿lo confirmo?' },
    );
    const summaryId = `wamid.S54_SUMMARY_${Date.now()}`;
    await send('a la cra 27 #45-12 en cabecera, pago en efectivo con 50', summaryId);

    // The reply to the summary turn is ONE interactive message (no text reply for that turn)
    const replies = await prisma.outboxMessage.findMany({
      where: { merchantId: MERCHANT_ID, dedupeKey: `reply:${summaryId}` },
    });
    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe('SEND_INTERACTIVE');
    expect(replies[0].channelId).toBeTruthy();
    const interactive = (
      replies[0].payloadJson as {
        interactive: { body: string; buttons: Array<{ id: string; title: string }> };
      }
    ).interactive;
    expect(interactive.buttons.map((b) => b.id)).toEqual([
      'delivery_confirm_yes',
      'delivery_confirm_no',
    ]);
    interactive.buttons.forEach((b) => expect(b.title.length).toBeLessThanOrEqual(20));
    // Body = exact presenter block (+ fixed question), not the LLM sentence
    expect(interactive.body).toMatch(/Total \.+ \$40\.000/);
    expect(interactive.body).toContain('2× Hamburguesa sencilla (sin cebolla)');
    expect(interactive.body).not.toContain('Te dejo el resumen');
    expect(interactive.body.endsWith('¿Confirmamos tu pedido?')).toBe(true);
    expect(await orders()).toBe(0);

    const conv = await prisma.conversation.findFirstOrThrow({ where: { merchantId: MERCHANT_ID } });
    const token = (conv.metadata as { delivery: { checkout: { summary: { token: string } } } })
      .delivery.checkout.summary.token;

    // "No" button: even if the LLM tries to confirm, the negative classifier blocks it
    fake.enqueue(
      { toolCalls: [{ name: 'confirmar_pedido', arguments: { confirmationToken: token } }] },
      { text: 'Claro, ¿qué quieres cambiar?' },
    );
    await post(buttonReply(customerPhone, 'delivery_confirm_no', 'No, cambiar algo'));
    expect(await orders()).toBe(0);
    const noLog = await prisma.messageLog.findFirst({
      where: { merchantId: MERCHANT_ID, direction: 'IN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(noLog?.text).toBe('No, cambiar algo');

    // "Sí" button: same effect as AC-14 (typed "dale")
    fake.enqueue(
      { toolCalls: [{ name: 'confirmar_pedido', arguments: { confirmationToken: token } }] },
      { text: '¡Listo! Tu pedido ya está en cocina 🍔' },
    );
    await post(buttonReply(customerPhone, 'delivery_confirm_yes', 'Sí, confirmo'));

    const order = await prisma.order.findFirstOrThrow({
      where: { merchantId: MERCHANT_ID },
      include: { items: true },
    });
    expect(order.status).toBe('confirmed');
    expect(Number(order.totalAmount)).toBe(40000);
    expect(Number(order.shippingCost)).toBe(4000);
    expect(order.deliveryZone).toBe('Cabecera');
    expect(order.items.find((i) => i.variantId === v['HAM-SEN'])?.notes).toBe('sin cebolla');
    expect(
      await prisma.cart.count({ where: { merchantId: MERCHANT_ID, status: 'completed' } }),
    ).toBe(1);
    const confirmed = await prisma.outboxMessage.findFirst({
      where: { merchantId: MERCHANT_ID, dedupeKey: `order:${order.id}:status:confirmed` },
    });
    expect(JSON.stringify(confirmed?.payloadJson)).toContain('pedido_confirmado');
  });

  it('S5.4-T3: ver_foto_producto sends only Product.imageUrl from the DB; null → "no tengo foto"', async () => {
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: v['HAM-SEN'] },
      select: { productId: true },
    });
    const photoUrl = 'https://cdn.example.com/s54/hamburguesa-sencilla.jpg';
    await prisma.product.update({
      where: { id: variant.productId },
      data: { imageUrl: photoUrl },
    });
    const images = () =>
      prisma.outboxMessage.findMany({ where: { merchantId: MERCHANT_ID, type: 'SEND_IMAGE' } });

    fake.enqueue(
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
      { toolCalls: [{ name: 'ver_foto_producto', arguments: { variantId: v['HAM-SEN'] } }] },
      { text: 'Te mandé la foto 📸' },
    );
    await send('me muestras la foto de la hamburguesa sencilla?');
    const sent = await images();
    expect(sent).toHaveLength(1);
    expect(sent[0].payloadJson).toMatchObject({
      image: { link: photoUrl, caption: 'Hamburguesa sencilla' },
    });

    await prisma.product.update({ where: { id: variant.productId }, data: { imageUrl: null } });
    fake.enqueue(
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
      { toolCalls: [{ name: 'ver_foto_producto', arguments: { variantId: v['HAM-SEN'] } }] },
      { text: 'No tengo foto de ese producto, pero te cuento que es deliciosa.' },
    );
    await send('y otra foto?');
    expect(await images()).toHaveLength(1);
    const toolResults = fake.calls
      .flatMap((c) => (c.method === 'generateWithTools' ? c.request.messages : []))
      .filter((m) => m.role === 'tool' && m.content.includes('NO_PHOTO'));
    expect(toolResults.length).toBeGreaterThan(0);
    expect(toolResults[0].content).toContain('No tengo foto de ese producto.');
  });
});
