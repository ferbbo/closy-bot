import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';

/**
 * E2E tests for Meta WhatsApp Cloud API webhook compliance
 *
 * Tests:
 * - GET verification handshake
 * - POST with Meta payload format
 * - X-Hub-Signature-256 validation
 * - Status-only payloads (early return)
 * - Multiple messages handling
 */
describe('Meta WhatsApp Webhook Compliance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let appSecret: string;
  let verifyToken: string;

  beforeAll(async () => {
    // Set test environment variables before creating the app
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-verify-token-e2e';
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret-e2e';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      rawBody: true, // Required for signature validation
    });

    // Apply the same validation pipe as in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);

    // Get config values from environment
    appSecret = process.env.WHATSAPP_APP_SECRET!;
    verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.inboundMessage.deleteMany({
      where: {
        messageId: {
          startsWith: 'wamid.e2e-',
        },
      },
    });
  });

  /**
   * Helper function to generate Meta webhook signature
   */
  function generateMetaSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const hash = hmac.digest('hex');
    return `sha256=${hash}`;
  }

  describe('GET /webhooks/whatsapp - Verification', () => {
    it('should verify webhook with correct token', () => {
      return request(app.getHttpServer())
        .get('/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': verifyToken,
          'hub.challenge': 'test-challenge-12345',
        })
        .expect(200)
        .expect('test-challenge-12345');
    });

    it('should reject verification with invalid token', () => {
      return request(app.getHttpServer())
        .get('/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'test-challenge-12345',
        })
        .expect(403);
    });

    it('should reject verification with invalid mode', () => {
      return request(app.getHttpServer())
        .get('/webhooks/whatsapp')
        .query({
          'hub.mode': 'invalid',
          'hub.verify_token': verifyToken,
          'hub.challenge': 'test-challenge-12345',
        })
        .expect(403);
    });
  });

  describe('POST /webhooks/whatsapp - Meta Payload', () => {
    const metaTextPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+1234567890',
                  phone_number_id: 'phone_123',
                },
                messages: [
                  {
                    from: '+573001234567',
                    id: 'wamid.e2e-test-123',
                    timestamp: '1707820800',
                    type: 'text',
                    text: {
                      body: 'Hello from Meta webhook',
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    it('should process Meta webhook with valid signature', async () => {
      const payloadString = JSON.stringify(metaTextPayload);
      const signature = generateMetaSignature(payloadString, appSecret);

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadString)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ received: true });
        });

      // Verify message was persisted
      const message = await prisma.inboundMessage.findUnique({
        where: { messageId: 'wamid.e2e-test-123' },
      });

      expect(message).not.toBeNull();
      expect(message?.from).toBe('+573001234567');
      expect(message?.text).toBe('Hello from Meta webhook');
    });

    it('should reject webhook with invalid signature', async () => {
      const payloadString = JSON.stringify(metaTextPayload);
      const invalidSignature = 'sha256=invalid_hash_12345';

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', invalidSignature)
        .send(payloadString)
        .expect(401);
    });

    it('should reject webhook without signature header', async () => {
      const payloadString = JSON.stringify(metaTextPayload);

      // Only reject if app secret is configured
      if (appSecret && appSecret !== '') {
        await request(app.getHttpServer())
          .post('/webhooks/whatsapp')
          .set('Content-Type', 'application/json')
          .send(payloadString)
          .expect(401);
      }
    });

    it('should handle status-only payload', async () => {
      const statusPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  statuses: [
                    {
                      id: 'wamid.status-123',
                      status: 'delivered',
                      timestamp: '1707820800',
                      recipient_id: '+573001234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const payloadString = JSON.stringify(statusPayload);
      const signature = generateMetaSignature(payloadString, appSecret);

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadString)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ received: true });
        });

      // Verify no message was persisted
      const message = await prisma.inboundMessage.findUnique({
        where: { messageId: 'wamid.status-123' },
      });

      expect(message).toBeNull();
    });

    it('should handle multiple messages in single payload', async () => {
      const multiMessagePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.e2e-multi-1',
                      timestamp: '1707820800',
                      type: 'text',
                      text: { body: 'Message 1' },
                    },
                    {
                      from: '+573001234567',
                      id: 'wamid.e2e-multi-2',
                      timestamp: '1707820801',
                      type: 'text',
                      text: { body: 'Message 2' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const payloadString = JSON.stringify(multiMessagePayload);
      const signature = generateMetaSignature(payloadString, appSecret);

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadString)
        .expect(200);

      // Verify both messages were persisted
      const message1 = await prisma.inboundMessage.findUnique({
        where: { messageId: 'wamid.e2e-multi-1' },
      });

      const message2 = await prisma.inboundMessage.findUnique({
        where: { messageId: 'wamid.e2e-multi-2' },
      });

      expect(message1).not.toBeNull();
      expect(message2).not.toBeNull();
      expect(message1?.text).toBe('Message 1');
      expect(message2?.text).toBe('Message 2');
    });

    it('should skip unsupported message types', async () => {
      const imagePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.e2e-image-1',
                      timestamp: '1707820800',
                      type: 'image',
                      image: {
                        id: 'img_123',
                        mime_type: 'image/jpeg',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const payloadString = JSON.stringify(imagePayload);
      const signature = generateMetaSignature(payloadString, appSecret);

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadString)
        .expect(200);

      // Verify no message was persisted (image not supported yet)
      const message = await prisma.inboundMessage.findUnique({
        where: { messageId: 'wamid.e2e-image-1' },
      });

      expect(message).toBeNull();
    });

    it('should handle idempotency for duplicate Meta messages', async () => {
      const payloadString = JSON.stringify(metaTextPayload);
      const signature = generateMetaSignature(payloadString, appSecret);

      // First request
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadString)
        .expect(200);

      // Duplicate request
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadString)
        .expect(200);

      // Verify only one record exists
      const messages = await prisma.inboundMessage.findMany({
        where: { messageId: 'wamid.e2e-test-123' },
      });

      expect(messages).toHaveLength(1);
    });
  });

  describe('POST /webhooks/whatsapp/inbound - Legacy endpoint', () => {
    it('should still accept normalized format on legacy endpoint', async () => {
      const legacyPayload = {
        message_id: 'wamid.e2e-legacy-123',
        from: '+573001234567',
        timestamp: '2026-02-13T10:00:00Z',
        text: 'Legacy endpoint test',
      };

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(legacyPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.processed).toBe(true);
        });

      // Verify message was persisted
      const message = await prisma.inboundMessage.findUnique({
        where: { messageId: 'wamid.e2e-legacy-123' },
      });

      expect(message).not.toBeNull();
    });
  });
});
