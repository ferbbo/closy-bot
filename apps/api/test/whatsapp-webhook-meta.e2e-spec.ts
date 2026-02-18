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
  let defaultMerchant: { id: string }; // PR-03.11: Default merchant for existing tests
  let defaultChannel: { id: string }; // PR-03.11: Default channel for existing tests

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

    // PR-03.11: Seed default merchant and channel for existing tests
    defaultMerchant = await prisma.merchant.upsert({
      where: { id: 'merchant-default-e2e' },
      create: {
        id: 'merchant-default-e2e',
        name: 'Default Test Merchant',
        whatsappNumber: '+10000000000',
        apiKey: 'api-key-default-e2e',
        industry: 'ropa',
        playbookConfig: { playbook: 'ROPA' },
      },
      update: {},
    });

    defaultChannel = await prisma.channel.upsert({
      where: {
        type_externalId: {
          type: 'WHATSAPP',
          externalId: 'phone_123',
        },
      },
      create: {
        merchantId: defaultMerchant.id,
        type: 'WHATSAPP',
        externalId: 'phone_123',
        displayName: 'Default Test Channel',
        credentials: {
          businessAccountId: 'ba-default',
          phoneNumberId: 'phone_123',
          accessToken: 'token-default',
        },
        isActive: true,
      },
      update: {},
    });
  });

  afterAll(async () => {
    // Clean up default merchant and channel
    await prisma.channel.deleteMany({
      where: { id: defaultChannel.id },
    });
    await prisma.merchant.deleteMany({
      where: { id: defaultMerchant.id },
    });
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

  // PR-03.11 REQ-09: E2E tests for multi-channel routing
  describe('POST /webhooks/whatsapp - Multi-channel routing (PR-03.11)', () => {
    let merchantA: { id: string };
    let merchantB: { id: string };
    let channelA: { id: string };
    let channelB: { id: string };

    beforeAll(async () => {
      // Seed 2 merchants with 2 different channels
      merchantA = await prisma.merchant.create({
        data: {
          id: 'merchant-a-e2e',
          name: 'Merchant A E2E',
          whatsappNumber: '+1111111111', // Legacy field, kept for backwards compat
          apiKey: 'api-key-a-e2e',
          industry: 'ropa',
          playbookConfig: { playbook: 'ROPA' },
        },
      });

      merchantB = await prisma.merchant.create({
        data: {
          id: 'merchant-b-e2e',
          name: 'Merchant B E2E',
          whatsappNumber: '+2222222222', // Legacy field, kept for backwards compat
          apiKey: 'api-key-b-e2e',
          industry: 'belleza',
          playbookConfig: { playbook: 'BELLEZA' },
        },
      });

      channelA = await prisma.channel.create({
        data: {
          merchantId: merchantA.id,
          type: 'WHATSAPP',
          externalId: 'phone-A-123',
          displayName: 'Channel A',
          credentials: {
            businessAccountId: 'ba-A',
            phoneNumberId: 'phone-A-123',
            accessToken: 'token-A',
          },
          isActive: true,
        },
      });

      channelB = await prisma.channel.create({
        data: {
          merchantId: merchantB.id,
          type: 'WHATSAPP',
          externalId: 'phone-B-456',
          displayName: 'Channel B',
          credentials: {
            businessAccountId: 'ba-B',
            phoneNumberId: 'phone-B-456',
            accessToken: 'token-B',
          },
          isActive: true,
        },
      });
    });

    afterAll(async () => {
      // Cleanup (in correct order to avoid FK violations)
      await prisma.outboxMessage.deleteMany({
        where: { merchantId: { in: [merchantA.id, merchantB.id] } },
      });
      await prisma.messageLog.deleteMany({
        where: { merchantId: { in: [merchantA.id, merchantB.id] } },
      });
      await prisma.conversation.deleteMany({
        where: { merchantId: { in: [merchantA.id, merchantB.id] } },
      });
      await prisma.channel.deleteMany({
        where: { id: { in: [channelA.id, channelB.id] } },
      });
      await prisma.merchant.deleteMany({
        where: { id: { in: [merchantA.id, merchantB.id] } },
      });
    });

    beforeEach(async () => {
      // Clean up test conversations and outbox messages
      await prisma.conversation.deleteMany({
        where: { merchantId: { in: [merchantA.id, merchantB.id] } },
      });
      await prisma.outboxMessage.deleteMany({
        where: { merchantId: { in: [merchantA.id, merchantB.id] } },
      });
    });

    it('AC-10: should route messages to correct merchant based on phone_number_id', async () => {
      // Message to Merchant A
      const payloadA = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1111111111',
                    phone_number_id: 'phone-A-123',
                  },
                  messages: [
                    {
                      from: '+573001111111',
                      id: 'wamid.e2e-merchant-a',
                      timestamp: '1707820800',
                      type: 'text',
                      text: { body: 'Hello Merchant A' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      // Message to Merchant B
      const payloadB = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+2222222222',
                    phone_number_id: 'phone-B-456',
                  },
                  messages: [
                    {
                      from: '+573002222222',
                      id: 'wamid.e2e-merchant-b',
                      timestamp: '1707820801',
                      type: 'text',
                      text: { body: 'Hello Merchant B' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const signatureA = generateMetaSignature(JSON.stringify(payloadA), appSecret);
      const signatureB = generateMetaSignature(JSON.stringify(payloadB), appSecret);

      // Send to Merchant A
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signatureA)
        .send(JSON.stringify(payloadA))
        .expect(200);

      // Send to Merchant B
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signatureB)
        .send(JSON.stringify(payloadB))
        .expect(200);

      // Verify conversations created for each merchant
      const conversationA = await prisma.conversation.findFirst({
        where: { merchantId: merchantA.id },
      });
      const conversationB = await prisma.conversation.findFirst({
        where: { merchantId: merchantB.id },
      });

      expect(conversationA).not.toBeNull();
      expect(conversationB).not.toBeNull();
      expect(conversationA!.merchantId).toBe(merchantA.id);
      expect(conversationB!.merchantId).toBe(merchantB.id);
    });

    it('AC-11: should save correct channelId in Conversation', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1111111111',
                    phone_number_id: 'phone-A-123',
                  },
                  messages: [
                    {
                      from: '+573003333333',
                      id: 'wamid.e2e-channel-a',
                      timestamp: '1707820802',
                      type: 'text',
                      text: { body: 'Test channelId' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const signature = generateMetaSignature(JSON.stringify(payload), appSecret);

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(JSON.stringify(payload))
        .expect(200);

      const conversation = await prisma.conversation.findFirst({
        where: { merchantId: merchantA.id },
      });

      expect(conversation).not.toBeNull();
      expect(conversation!.channelId).toBe(channelA.id);
    });

    it('AC-12: should save channelId in OutboxMessage', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1111111111',
                    phone_number_id: 'phone-A-123',
                  },
                  messages: [
                    {
                      from: '+573004444444',
                      id: 'wamid.e2e-outbox-test',
                      timestamp: '1707820803',
                      type: 'text',
                      text: { body: 'Test outbox channelId' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const signature = generateMetaSignature(JSON.stringify(payload), appSecret);

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(JSON.stringify(payload))
        .expect(200);

      // Give time for outbox to be created
      await new Promise((resolve) => setTimeout(resolve, 100));

      const outboxMessage = await prisma.outboxMessage.findFirst({
        where: { merchantId: merchantA.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(outboxMessage).not.toBeNull();
      expect(outboxMessage!.channelId).toBe(channelA.id);
    });

    it('AC-08: should handle unknown channel with 200 OK without crash', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '999',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+9999999999',
                    phone_number_id: 'phone-unknown-999',
                  },
                  messages: [
                    {
                      from: '+573009999999',
                      id: 'wamid.e2e-unknown',
                      timestamp: '1707820804',
                      type: 'text',
                      text: { body: 'Unknown channel' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const signature = generateMetaSignature(JSON.stringify(payload), appSecret);

      // Should not crash, return 200
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(JSON.stringify(payload))
        .expect(200);

      // Verify no conversation created for unknown channel
      const conversation = await prisma.conversation.findFirst({
        where: {
          customer: {
            phone: '+573009999999',
          },
        },
      });

      expect(conversation).toBeNull();
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
