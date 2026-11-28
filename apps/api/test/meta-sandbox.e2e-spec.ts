import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import {
  FakeGraphApi,
  FIXTURE_AUDIO,
  FIXTURE_AUDIO_ID,
  FIXTURE_IMAGE,
  FIXTURE_IMAGE_ID,
} from './meta-sandbox/fake-graph-api';
import { applySandboxEnv } from './meta-sandbox/env';
import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import { inboundText, signPayload } from './meta-sandbox/webhook-builders';

/**
 * S1.5 — Meta Sandbox (AC-38 a–d).
 * (a)/(b) con el outbox real, los webhooks de campos WABA (template status/category/quality)
 * y (e) con register-whatsapp-templates se completan cuando S1.4 esté integrado
 * (hoy el DTO legacy del webhook responde 400 a los campos WABA: lo corrige S1.4-T4).
 */
describe('Meta Sandbox (e2e) — AC-38', () => {
  const graph = new FakeGraphApi({
    preloadTemplates: [
      {
        name: 'pedido_en_camino',
        language: 'es',
        category: 'UTILITY',
        status: 'APPROVED',
        paramNames: ['order_code', 'eta_minutes'],
        components: [],
      },
    ],
  });
  let baseUrl: string;
  const auth = { Authorization: `Bearer ${SANDBOX_APP.accessToken}` };
  const v = SANDBOX_APP.apiVersion;
  const customer = SANDBOX_APP.customers[0].replace('+', '');

  beforeAll(async () => {
    ({ baseUrl } = await graph.start());
  });
  afterAll(async () => {
    await graph.stop();
  });
  beforeEach(() => graph.reset());

  describe('AC-38 (a): messages endpoint registers valid Cloud API payloads', () => {
    it('accepts a text message and records it', async () => {
      const res = await request(baseUrl)
        .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
        .set(auth)
        .send({
          messaging_product: 'whatsapp',
          to: customer,
          type: 'text',
          text: { body: 'Hola 👋' },
        })
        .expect(200);

      expect(res.body.messages[0].id).toMatch(/^wamid\.SANDBOX/);
      expect(graph.sent()).toHaveLength(1);
      expect(graph.sent()[0]).toMatchObject({ to: customer, type: 'text' });
    });

    it('accepts a registered template with named parameters', async () => {
      await request(baseUrl)
        .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
        .set(auth)
        .send({
          messaging_product: 'whatsapp',
          to: customer,
          type: 'template',
          template: {
            name: 'pedido_en_camino',
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', parameter_name: 'order_code', text: 'ORD-0042' },
                  { type: 'text', parameter_name: 'eta_minutes', text: '20' },
                ],
              },
            ],
          },
        })
        .expect(200);
      expect(graph.sent()[0].type).toBe('template');
    });

    it('accepts an interactive button message', async () => {
      await request(baseUrl)
        .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
        .set(auth)
        .send({
          messaging_product: 'whatsapp',
          to: customer,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: '¿Confirmas tu pedido?' },
            action: { buttons: [{ type: 'reply', reply: { id: 'confirm_yes', title: 'Sí' } }] },
          },
        })
        .expect(200);
      expect(graph.sent()[0].type).toBe('interactive');
    });

    it('rejects a wrong access token with Meta error 190', async () => {
      const res = await request(baseUrl)
        .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
        .set({ Authorization: 'Bearer wrong' })
        .send({ messaging_product: 'whatsapp', to: customer, type: 'text', text: { body: 'x' } })
        .expect(401);
      expect(res.body.error.code).toBe(190);
    });
  });

  describe('AC-38 (b): Meta-formatted errors', () => {
    const templateMsg = (name: string, text: string) => ({
      messaging_product: 'whatsapp',
      to: customer,
      type: 'template',
      template: {
        name,
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'order_code', text },
              { type: 'text', parameter_name: 'eta_minutes', text: '20' },
            ],
          },
        ],
      },
    });

    it('unregistered template → 132001 with error_data', async () => {
      const res = await request(baseUrl)
        .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
        .set(auth)
        .send(templateMsg('plantilla_inexistente', 'ORD-1'))
        .expect(404);
      expect(res.body.error).toMatchObject({
        code: 132001,
        error_data: { messaging_product: 'whatsapp' },
      });
      expect(graph.sent()).toHaveLength(0);
    });

    it('parameter with a newline → 132018', async () => {
      const res = await request(baseUrl)
        .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
        .set(auth)
        .send(templateMsg('pedido_en_camino', 'ORD-1\nhola'))
        .expect(400);
      expect(res.body.error.code).toBe(132018);
    });

    it('fail-next simulates 429 / 131047 once', async () => {
      await request(baseUrl)
        .post('/__sandbox/fail-next')
        .send({
          endpoint: 'messages',
          httpStatus: 400,
          code: 131047,
          message: 'Re-engagement message',
        })
        .expect(200);
      const send = () =>
        request(baseUrl)
          .post(`/${v}/${SANDBOX_APP.phoneNumberId}/messages`)
          .set(auth)
          .send({ messaging_product: 'whatsapp', to: customer, type: 'text', text: { body: 'x' } });
      const first = await send();
      expect(first.status).toBe(400);
      expect(first.body.error.code).toBe(131047);
      await send().expect(200);
    });
  });

  describe('AC-38 (c): media metadata + download', () => {
    it.each([
      [FIXTURE_AUDIO_ID, 'audio/ogg', FIXTURE_AUDIO],
      [FIXTURE_IMAGE_ID, 'image/jpeg', FIXTURE_IMAGE],
    ])('GET /{media-id} then download %s', async (mediaId, mime, fixture) => {
      const meta = await request(baseUrl).get(`/${v}/${mediaId}`).set(auth).expect(200);
      expect(meta.body).toMatchObject({ id: mediaId, mime_type: mime, file_size: fixture.length });

      const url = new URL(meta.body.url as string);
      const file = await request(`${url.protocol}//${url.host}`)
        .get(url.pathname)
        .set(auth)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, fixture)).toBe(0);
    });

    it('unknown media → 404 Meta error', async () => {
      const res = await request(baseUrl).get(`/${v}/nope`).set(auth).expect(404);
      expect(res.body.error.code).toBe(100);
    });
  });

  describe('AC-38 (d): signed webhooks against MetaSignatureGuard', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let restoreEnv: () => void;
    const merchantId = 'sandbox-merchant-e2e';

    beforeAll(async () => {
      restoreEnv = applySandboxEnv(baseUrl);
      // ConfigModule snapshots env when AppModule is imported → import after applying it
      const { AppModule } = await import('../src/app.module');
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleFixture.createNestApplication({ rawBody: true });
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();
      prisma = app.get(PrismaService);

      await prisma.merchant.upsert({
        where: { id: merchantId },
        create: {
          id: merchantId,
          name: 'Sandbox Merchant',
          whatsappNumber: SANDBOX_APP.merchantPhone,
          apiKey: 'api-key-sandbox-e2e',
          industry: 'restaurante',
          status: 'active',
        },
        update: {},
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
        update: {},
      });
    });

    afterAll(async () => {
      try {
        await prisma.outboxMessage.deleteMany({ where: { merchantId } });
        await prisma.messageLog.deleteMany({ where: { merchantId } });
        await prisma.conversation.deleteMany({ where: { merchantId } });
        await prisma.channel.deleteMany({ where: { merchantId } });
        await prisma.merchant.deleteMany({ where: { id: merchantId } });
      } finally {
        await app.close();
        restoreEnv();
      }
    });

    it('accepts a webhook signed with the sandbox appSecret', async () => {
      const raw = JSON.stringify(inboundText(SANDBOX_APP.customers[0], 'hola'));
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signPayload(raw))
        .send(raw)
        .expect(200);
    });

    it('rejects an invalid signature with 401', async () => {
      const raw = JSON.stringify(inboundText(SANDBOX_APP.customers[0], 'hola'));
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signPayload(raw, 'not-the-secret'))
        .send(raw)
        .expect(401);
    });

    it('answers the verification handshake with the sandbox verify token', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': SANDBOX_APP.verifyToken,
          'hub.challenge': '12345',
        })
        .expect(200);
      expect(res.text).toBe('12345');
    });
  });
});
