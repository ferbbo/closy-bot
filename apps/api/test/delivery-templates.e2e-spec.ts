import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { BusinessMessengerService } from '../src/verticals/delivery/messaging/business-messenger.service';
import { OutboxDispatcherService } from '../src/workers/outbox-dispatcher/outbox-dispatcher.service';
import { FakeGraphApi } from './meta-sandbox/fake-graph-api';
import { applySandboxEnv } from './meta-sandbox/env';
import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import { signPayload, templateCategoryUpdate } from './meta-sandbox/webhook-builders';

/**
 * S1.4 + S1.5 — Business-initiated messaging through the Meta Sandbox.
 * AC-34 (SEND_TEMPLATE con params y dedupeKey), AC-35 (opt-out), AC-36 (recategorización),
 * AC-38 (a) por el outbox real, (b) error de Meta → outbox con reintento, (e) register --apply.
 */
jest.setTimeout(60000); // beforeAll runs the register script with tsx

describe('Delivery templates via Meta Sandbox (e2e)', () => {
  const graph = new FakeGraphApi();
  const merchantId = 'dlv-tpl-merchant-e2e';
  const customerPhone = SANDBOX_APP.customers[1];
  let app: INestApplication;
  let prisma: PrismaService;
  let messenger: BusinessMessengerService;
  let dispatcher: OutboxDispatcherService;
  let restoreEnv: () => void;
  let conversationId: string;
  let baseUrl: string;
  const prevFlags = { mode: process.env.FEATURES_MODE, enabled: process.env.DELIVERY_ENABLED };

  const notifyOnTheWay = (orderId: string, dedupe = 'status:on_the_way') =>
    messenger.notify({
      merchantId,
      to: customerPhone,
      conversationId,
      orderId,
      template: 'pedido_en_camino',
      params: { order_code: 'ORD-0042', merchant_name: 'Burger\nBarrio' },
      dedupeKey: `order:${orderId}:${dedupe}`,
      freeText: 'Tu pedido ORD-0042 va en camino 🛵',
    });

  beforeAll(async () => {
    ({ baseUrl } = await graph.start());
    restoreEnv = applySandboxEnv(baseUrl);
    process.env.FEATURES_MODE = 'dev';
    process.env.DELIVERY_ENABLED = 'true';

    // AC-38 (e): register the 10 catalog templates against the sandbox with the real script
    // async: the fake Graph API lives in this process, a sync child would deadlock it
    const { stdout } = await promisify(execFile)(
      'npx',
      ['tsx', 'scripts/register-whatsapp-templates.ts', '--apply'],
      {
        cwd: resolve(__dirname, '../../..'),
        env: { ...process.env, CI: '', WABA_ID: SANDBOX_APP.wabaId },
      },
    );
    expect(stdout).not.toContain('FAIL');

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    messenger = app.get(BusinessMessengerService, { strict: false });
    dispatcher = app.get(OutboxDispatcherService, { strict: false });

    await prisma.merchant.create({
      data: {
        id: merchantId,
        name: 'Burger Barrio',
        whatsappNumber: SANDBOX_APP.merchantPhone,
        apiKey: 'api-key-dlv-tpl-e2e',
        industry: 'restaurante',
        status: 'active',
      },
    });
    await prisma.channel.upsert({
      where: { type_externalId: { type: 'WHATSAPP', externalId: SANDBOX_APP.phoneNumberId } },
      create: {
        merchantId,
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
      update: { merchantId, wabaId: SANDBOX_APP.wabaId },
    });
    const customer = await prisma.customer.upsert({
      where: { phone: customerPhone },
      create: { phone: customerPhone, name: 'Cliente Sandbox' },
      update: {},
    });
    const conversation = await prisma.conversation.create({
      data: { customerId: customer.id, merchantId, channel: 'whatsapp' },
    });
    conversationId = conversation.id;
  });

  afterAll(async () => {
    try {
      await prisma.outboxMessage.deleteMany({ where: { merchantId } });
      await prisma.messageLog.deleteMany({ where: { merchantId } });
      await prisma.conversation.deleteMany({ where: { merchantId } });
      await prisma.whatsappTemplateState.deleteMany({});
      await prisma.channel.deleteMany({ where: { merchantId } });
      await prisma.merchant.deleteMany({ where: { id: merchantId } });
    } finally {
      await app?.close();
      await graph.stop();
      restoreEnv();
      process.env.FEATURES_MODE = prevFlags.mode;
      process.env.DELIVERY_ENABLED = prevFlags.enabled;
      if (prevFlags.mode === undefined) delete process.env.FEATURES_MODE;
      if (prevFlags.enabled === undefined) delete process.env.DELIVERY_ENABLED;
    }
  });

  beforeEach(async () => {
    await prisma.conversation.update({ where: { id: conversationId }, data: { optedOutAt: null } });
  });

  it('AC-38 (e): register-whatsapp-templates --apply registers the 10 templates', () => {
    const names = graph.registeredTemplates().map((t) => t.name);
    expect(names).toHaveLength(10);
    expect(new Set(graph.registeredTemplates().map((t) => t.category))).toEqual(
      new Set(['UTILITY']),
    );
  });

  it('AC-34 + AC-38 (a): status notification → SEND_TEMPLATE in outbox → valid template at the sandbox; repeat → DUPLICATE', async () => {
    const result = await notifyOnTheWay('order-a');
    expect(result).toMatchObject({ status: 'queued', channel: 'template' });

    const row = await prisma.outboxMessage.findFirst({
      where: { merchantId, dedupeKey: 'order:order-a:status:on_the_way' },
    });
    expect(row?.type).toBe('SEND_TEMPLATE');

    await dispatcher.processOutbox();
    const sent = graph.sent().filter((m) => m.type === 'template');
    expect(sent).toHaveLength(1);
    const payload = sent[0].payload as {
      template: {
        name: string;
        components: Array<{ parameters: Array<{ parameter_name: string; text: string }> }>;
      };
    };
    expect(payload.template.name).toBe('pedido_en_camino');
    const params = payload.template.components[0].parameters;
    expect(params.map((p) => p.parameter_name).sort()).toEqual(['merchant_name', 'order_code']);
    expect(params.every((p) => !p.text.includes('\n'))).toBe(true);
    expect((await prisma.outboxMessage.findUnique({ where: { id: row!.id } }))?.status).toBe(
      'SENT',
    );

    await expect(notifyOnTheWay('order-a')).resolves.toMatchObject({
      status: 'skipped',
      reason: 'DUPLICATE',
    });
  });

  it('AC-38 (b): Meta error from the sandbox → outbox records the error and schedules a retry', async () => {
    graph.failNext('messages', {
      httpStatus: 404,
      code: 132001,
      message: 'Template name does not exist in the translation',
    });
    await notifyOnTheWay('order-b');
    await dispatcher.processOutbox();

    const row = await prisma.outboxMessage.findFirst({
      where: { merchantId, dedupeKey: 'order:order-b:status:on_the_way' },
    });
    expect(row?.status).not.toBe('SENT');
    expect(row?.attempts).toBeGreaterThanOrEqual(1);
    expect(row?.lastError).toBeTruthy();
  });

  it('AC-35: opted-out customer → skipped OPTED_OUT, nothing enqueued', async () => {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { optedOutAt: new Date() },
    });
    await expect(notifyOnTheWay('order-c')).resolves.toMatchObject({
      status: 'skipped',
      reason: 'OPTED_OUT',
    });
    expect(
      await prisma.outboxMessage.count({
        where: { merchantId, dedupeKey: { startsWith: 'order:order-c:' } },
      }),
    ).toBe(0);
  });

  it('AC-36: template_category_update → MARKETING; next on_the_way (window closed) is skipped + alerta_operacion', async () => {
    const raw = JSON.stringify(templateCategoryUpdate('pedido_en_camino', 'UTILITY', 'MARKETING'));
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200);

    const state = await prisma.whatsappTemplateState.findFirst({
      where: { name: 'pedido_en_camino' },
    });
    expect(state?.category).toBe('MARKETING');

    await expect(notifyOnTheWay('order-d')).resolves.toMatchObject({
      status: 'skipped',
      reason: 'TEMPLATE_NOT_USABLE',
    });
    const alerts = await prisma.outboxMessage.findMany({
      where: { merchantId, dedupeKey: { startsWith: 'alert:' } },
    });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(alerts.map((a) => a.payloadJson))).toContain('alerta_operacion');
  });
});
