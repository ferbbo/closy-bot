import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { DELIVERY_LLM_PROVIDER } from '../src/verticals/delivery/agent/delivery-agent.service';
import { BurstSweeperService } from '../src/verticals/delivery/burst/burst-sweeper.service';
import { FakeLlmProvider } from './utils/fake-llm.provider';
import { FakeGraphApi } from './meta-sandbox/fake-graph-api';
import { applySandboxEnv } from './meta-sandbox/env';
import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import { inboundText, signPayload } from './meta-sandbox/webhook-builders';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

const WINDOW_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * S5.1-T2 — Debounce de ráfagas (F-15, AC-25) de punta a punta con una ventana corta:
 * webhook firmado → buffer en Conversation.metadata.pendingBurst → un solo turno del
 * orquestador con los textos unidos por "\n". Más reinicio seguro (barrido).
 */
describe('Delivery burst debounce (e2e)', () => {
  const MERCHANT_ID = 'dlv_merchant_burger_barrio'; // prisma/seed-delivery.ts
  const customerPhone = SANDBOX_APP.customers[1];
  const graph = new FakeGraphApi();
  const fake = new FakeLlmProvider([]);
  let app: INestApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;
  const prev = {
    mode: process.env.FEATURES_MODE,
    enabled: process.env.DELIVERY_ENABLED,
    debounce: process.env.DELIVERY_DEBOUNCE_MS,
  };
  const run = Date.now();

  const post = async (text: string, id: string): Promise<number> => {
    const raw = JSON.stringify(inboundText(customerPhone, text, { id }));
    const started = Date.now();
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200)
      .expect({ received: true });
    return Date.now() - started;
  };
  const replies = () =>
    prisma.outboxMessage.findMany({
      where: { merchantId: MERCHANT_ID, type: 'SEND_TEXT' },
      orderBy: { createdAt: 'asc' },
    });
  const inboundLogs = () =>
    prisma.messageLog.findMany({
      where: { merchantId: MERCHANT_ID, direction: 'IN' },
      orderBy: { createdAt: 'asc' },
    });
  const conversation = () =>
    prisma.conversation.findFirstOrThrow({
      where: { merchantId: MERCHANT_ID, customer: { phone: customerPhone.replace('+', '') } },
    });
  const waitFor = async (cond: () => Promise<boolean>, timeoutMs = 5000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await cond()) return;
      await sleep(50);
    }
    throw new Error('waitFor timed out');
  };
  const reset = async () => {
    const where = { merchantId: MERCHANT_ID };
    await prisma.outboxMessage.deleteMany({ where });
    await prisma.messageLog.deleteMany({ where });
    fake.calls.length = 0;
  };

  beforeAll(async () => {
    const { baseUrl } = await graph.start();
    restoreEnv = applySandboxEnv(baseUrl);
    process.env.FEATURES_MODE = 'dev';
    process.env.DELIVERY_ENABLED = 'true';
    process.env.DELIVERY_DEBOUNCE_MS = String(WINDOW_MS); // overrides jest-e2e.setup ('0')

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
  });

  afterAll(async () => {
    try {
      const where = { merchantId: MERCHANT_ID };
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
        ['DELIVERY_DEBOUNCE_MS', prev.debounce],
      ] as const) {
        if (val === undefined) delete process.env[k];
        else process.env[k] = val;
      }
    }
  });

  beforeEach(reset);

  it('AC-25: three messages in < 4 s → one orchestrator turn with the concatenated text', async () => {
    fake.enqueue({ text: 'Hola veci, ya te ayudo con tu pedido.' });
    const ids = [1, 2, 3].map((n) => `wamid.burst.${run}.${n}`);
    const started = Date.now();
    const durations = [
      await post('hola', ids[0]),
      await post('quiero una hamburguesa sencilla', ids[1]),
      await post('y una coca de 400', ids[2]),
    ];
    expect(Date.now() - started).toBeLessThan(4000);
    // The webhook answers 200 without waiting for the window
    durations.forEach((ms) => expect(ms).toBeLessThan(WINDOW_MS * 3));
    // Inside the window nothing has been processed yet
    expect(await replies()).toHaveLength(0);
    const buffered = (await conversation()).metadata as { pendingBurst?: { messages: unknown[] } };
    expect(buffered.pendingBurst?.messages).toHaveLength(3);

    await waitFor(async () => (await replies()).length > 0);
    await sleep(WINDOW_MS * 2); // nothing else must arrive

    const out = await replies();
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe(`reply:${ids[2]}`);
    const logs = await inboundLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].text).toBe('hola\nquiero una hamburguesa sencilla\ny una coca de 400');
    expect(logs[0].providerMessageId).toBe(ids[2]);
    const llmTurns = fake.calls.filter((c) => c.method === 'generateWithTools');
    expect(llmTurns).toHaveLength(1);
    expect(JSON.stringify(llmTurns[0].request)).toContain(
      JSON.stringify('hola\nquiero una hamburguesa sencilla\ny una coca de 400').slice(1, -1),
    );
    const after = (await conversation()).metadata as Record<string, unknown>;
    expect(after.pendingBurst).toBeUndefined();
  });

  it('a duplicated message_id inside the window is buffered only once (dedupe kept)', async () => {
    fake.enqueue({ text: 'Claro, ¿algo más?' });
    const id = `wamid.burst.${run}.dup`;
    await post('una salchipapa', id);
    await post('una salchipapa', id);
    await waitFor(async () => (await replies()).length > 0);
    const logs = await inboundLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].text).toBe('una salchipapa');
  });

  it('restart-safe: the sweep processes expired buffers persisted in metadata, once', async () => {
    fake.enqueue({ text: 'Listo, ya lo reviso.' });
    const conv = await conversation();
    const channel = await prisma.channel.findFirstOrThrow({ where: { merchantId: MERCHANT_ID } });
    const past = new Date(Date.now() - 60_000).toISOString();
    const pendingBurst = {
      messages: [
        { messageId: `wamid.restart.${run}.1`, text: 'me regalas un perro', at: past },
        { messageId: `wamid.restart.${run}.2`, text: 'sin cebolla', at: past },
      ],
      dueAt: past,
      merchantId: MERCHANT_ID,
      channelId: channel.id,
      receiverPhoneId: SANDBOX_APP.phoneNumberId,
    };
    // Simulates a crash: the buffer is persisted but no in-memory timer exists
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        metadata: {
          ...((conv.metadata as Record<string, unknown> | null) ?? {}),
          pendingBurst,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const sweeper = app.get(BurstSweeperService);
    const [a, b] = await Promise.all([sweeper.sweep(), sweeper.sweep()]);
    expect(a + b).toBe(1);
    await expect(sweeper.sweep()).resolves.toBe(0);

    const out = await replies();
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe(`reply:wamid.restart.${run}.2`);
    const logs = await inboundLogs();
    expect(logs.map((l) => l.text)).toEqual(['me regalas un perro\nsin cebolla']);
    const after = (await conversation()).metadata as Record<string, unknown>;
    expect(after.pendingBurst).toBeUndefined();
  });

  it('the sweep leaves buffers whose window has not expired yet', async () => {
    const conv = await conversation();
    const channel = await prisma.channel.findFirstOrThrow({ where: { merchantId: MERCHANT_ID } });
    const future = new Date(Date.now() + 60_000).toISOString();
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        metadata: {
          ...((conv.metadata as Record<string, unknown> | null) ?? {}),
          pendingBurst: {
            messages: [{ messageId: `wamid.future.${run}`, text: 'hola', at: future }],
            dueAt: future,
            merchantId: MERCHANT_ID,
            channelId: channel.id,
            receiverPhoneId: SANDBOX_APP.phoneNumberId,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await expect(app.get(BurstSweeperService).sweep()).resolves.toBe(0);
    expect(((await conversation()).metadata as Record<string, unknown>).pendingBurst).toBeDefined();
  });
});
