import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';

/**
 * Integration tests for WhatsApp webhook idempotency
 *
 * These tests verify that duplicate messages (same message_id) are handled correctly:
 * - First request persists and returns 200 with processed=true
 * - Duplicate request returns 200 with processed=false, duplicate=true
 * - No duplicate processing occurs in the database
 */
describe('WhatsApp Webhook Idempotency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await prisma.inboundMessage.deleteMany({
      where: {
        messageId: {
          startsWith: 'test-',
        },
      },
    });
    // PR-03.10: Clean up message logs
    await prisma.messageLog.deleteMany({
      where: {
        providerMessageId: {
          startsWith: 'test-',
        },
      },
    });
  });

  describe('POST /webhooks/whatsapp/inbound', () => {
    const validPayload = {
      message_id: 'test-wamid-e2e-123',
      from: '1234567890',
      timestamp: '2026-02-11T10:00:00Z',
      text: 'Hello from e2e test',
    };

    it('should process a new message successfully', () => {
      return request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(validPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            processed: true,
          });
        });
    });

    it('should handle duplicate message_id idempotently', async () => {
      // First request - should succeed
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(validPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.processed).toBe(true);
        });

      // Second request with same message_id - should return duplicate flag
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(validPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            processed: false,
            duplicate: true,
          });
        });

      // Verify only one record exists in database
      const messages = await prisma.inboundMessage.findMany({
        where: { messageId: validPayload.message_id },
      });

      expect(messages).toHaveLength(1);
    });

    it('should not create duplicate MessageLog when message_id is duplicated (AC-07)', async () => {
      // Arrange & Act: First request creates MessageLog
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(validPayload)
        .expect(200);

      // Act: Second request with same message_id should not create another MessageLog
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(validPayload)
        .expect(200);

      // Assert: Only one MessageLog should exist
      const messageLogs = await prisma.messageLog.findMany({
        where: {
          providerMessageId: validPayload.message_id,
          direction: 'IN',
        },
      });

      expect(messageLogs).toHaveLength(1);
      expect(messageLogs[0].providerMessageId).toBe(validPayload.message_id);
    });

    it('should reject invalid payload with 400', () => {
      const invalidPayload = {
        message_id: 'test-invalid',
        // missing required 'from' field
        timestamp: '2026-02-11T10:00:00Z',
      };

      return request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(invalidPayload)
        .expect(400);
    });

    it('should handle message with media attachment', async () => {
      const mediaPayload = {
        message_id: 'test-media-456',
        from: '9876543210',
        timestamp: '2026-02-11T11:00:00Z',
        text: 'Check this image',
        media_type: 'image',
        media_url: 'https://example.com/image.jpg',
      };

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(mediaPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.processed).toBe(true);
        });

      // Verify media fields are persisted
      const message = await prisma.inboundMessage.findUnique({
        where: { messageId: mediaPayload.message_id },
      });

      expect(message).toMatchObject({
        mediaType: 'image',
        mediaUrl: 'https://example.com/image.jpg',
      });
    });

    it('should reject invalid media_type with 400', () => {
      const invalidMedia = {
        message_id: 'test-bad-media',
        from: '1234567890',
        timestamp: '2026-02-11T12:00:00Z',
        media_type: 'invalid_type', // Not in allowed values
        media_url: 'https://example.com/file',
      };

      return request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(invalidMedia)
        .expect(400);
    });

    it('should process multiple distinct messages correctly', async () => {
      const messages = [
        {
          message_id: 'test-msg-1',
          from: '1111111111',
          timestamp: '2026-02-11T10:00:00Z',
          text: 'Message 1',
        },
        {
          message_id: 'test-msg-2',
          from: '2222222222',
          timestamp: '2026-02-11T10:01:00Z',
          text: 'Message 2',
        },
        {
          message_id: 'test-msg-3',
          from: '3333333333',
          timestamp: '2026-02-11T10:02:00Z',
          text: 'Message 3',
        },
      ];

      // Process all messages
      for (const msg of messages) {
        await request(app.getHttpServer())
          .post('/webhooks/whatsapp/inbound')
          .send(msg)
          .expect(200)
          .expect((res) => {
            expect(res.body.processed).toBe(true);
          });
      }

      // Verify all are persisted
      const count = await prisma.inboundMessage.count({
        where: {
          messageId: {
            in: messages.map((m) => m.message_id),
          },
        },
      });

      expect(count).toBe(3);
    });

    it('should preserve message order via timestamp when received out-of-order', async () => {
      const sender = '4444444444';

      // Send message 3 FIRST (higher timestamp)
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send({
          message_id: 'test-order-msg-3',
          from: sender,
          timestamp: '2026-02-11T10:30:00Z',
          text: 'Third message',
        })
        .expect(200);

      // Send message 1 SECOND (lowest timestamp)
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send({
          message_id: 'test-order-msg-1',
          from: sender,
          timestamp: '2026-02-11T10:10:00Z',
          text: 'First message',
        })
        .expect(200);

      // Send message 2 THIRD (middle timestamp)
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send({
          message_id: 'test-order-msg-2',
          from: sender,
          timestamp: '2026-02-11T10:20:00Z',
          text: 'Second message',
        })
        .expect(200);

      // Verify messages are ordered by timestamp (not arrival order)
      const messages = await prisma.inboundMessage.findMany({
        where: { from: sender },
        orderBy: { timestamp: 'asc' },
      });

      expect(messages).toHaveLength(3);
      expect(messages[0].messageId).toBe('test-order-msg-1');
      expect(messages[0].text).toBe('First message');
      expect(messages[1].messageId).toBe('test-order-msg-2');
      expect(messages[1].text).toBe('Second message');
      expect(messages[2].messageId).toBe('test-order-msg-3');
      expect(messages[2].text).toBe('Third message');
    });

    it('should reject payload with extra fields when forbidNonWhitelisted is enabled', () => {
      const payloadWithExtra = {
        message_id: 'test-extra-fields',
        from: '5555555555',
        timestamp: '2026-02-11T13:00:00Z',
        text: 'Valid text',
        extraField: 'should be rejected', // Not in DTO
        anotherExtra: 123,
      };

      return request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(payloadWithExtra)
        .expect(400)
        .expect((res) => {
          const messages = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
          expect(messages.some((msg: string) => msg.includes('property'))).toBe(true);
        });
    });

    it('should handle concurrent duplicate requests correctly (race condition)', async () => {
      const racePayload = {
        message_id: 'test-race-condition-789',
        from: '6666666666',
        timestamp: '2026-02-11T14:00:00Z',
        text: 'Racing message',
      };

      // Send two identical requests concurrently
      const [response1, response2] = await Promise.all([
        request(app.getHttpServer()).post('/webhooks/whatsapp/inbound').send(racePayload),
        request(app.getHttpServer()).post('/webhooks/whatsapp/inbound').send(racePayload),
      ]);

      // Both should return 200
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // One should be processed, one should be duplicate
      const responses = [response1.body, response2.body];
      const processedCount = responses.filter((r) => r.processed === true).length;
      const duplicateCount = responses.filter((r) => r.duplicate === true).length;

      expect(processedCount).toBe(1);
      expect(duplicateCount).toBe(1);

      // Verify only one record in database
      const messages = await prisma.inboundMessage.findMany({
        where: { messageId: racePayload.message_id },
      });

      expect(messages).toHaveLength(1);
    });
  });

  describe('Conversation Flow (e2e)', () => {
    // Need to seed merchant and products for these tests
    beforeAll(async () => {
      // Ensure merchant exists
      await prisma.merchant.upsert({
        where: { apiKey: 'sk_test_dev_merchant_001' },
        update: {},
        create: {
          name: 'Dev Test Store',
          whatsappNumber: '+573001111111',
          apiKey: 'sk_test_dev_merchant_001',
        },
      });
    });

    it('should respond to greeting message', async () => {
      const greetingPayload = {
        message_id: 'test-greeting-001',
        from: '+573001234567',
        timestamp: '2026-02-13T10:00:00Z',
        text: 'hola',
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(greetingPayload)
        .expect(200);

      expect(response.body.processed).toBe(true);

      // Verify conversation and customer were created
      const customer = await prisma.customer.findUnique({
        where: { phone: greetingPayload.from },
      });
      expect(customer).toBeDefined();

      const conversation = await prisma.conversation.findFirst({
        where: {
          customerId: customer!.id,
          channel: 'whatsapp',
        },
      });
      expect(conversation).toBeDefined();
    });

    it('should respond to help request', async () => {
      const helpPayload = {
        message_id: 'test-help-001',
        from: '+573002222222',
        timestamp: '2026-02-13T10:05:00Z',
        text: 'ayuda',
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(helpPayload)
        .expect(200);

      expect(response.body.processed).toBe(true);
    });

    it('should search products and return results', async () => {
      const searchPayload = {
        message_id: 'test-search-001',
        from: '+573003333333',
        timestamp: '2026-02-13T10:10:00Z',
        text: 'busco camisa',
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(searchPayload)
        .expect(200);

      expect(response.body.processed).toBe(true);
    });

    it('should handle different customer in same conversation flow', async () => {
      const customer1Phone = '+573004444444';
      const customer2Phone = '+573005555555';

      // Customer 1 sends greeting
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send({
          message_id: 'test-multi-user-1',
          from: customer1Phone,
          timestamp: '2026-02-13T10:15:00Z',
          text: 'hola',
        })
        .expect(200);

      // Customer 2 sends different message
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send({
          message_id: 'test-multi-user-2',
          from: customer2Phone,
          timestamp: '2026-02-13T10:16:00Z',
          text: 'busco pantalón',
        })
        .expect(200);

      // Verify separate conversations
      const customer1 = await prisma.customer.findUnique({
        where: { phone: customer1Phone },
      });
      const customer2 = await prisma.customer.findUnique({
        where: { phone: customer2Phone },
      });

      const conv1 = await prisma.conversation.findFirst({
        where: { customerId: customer1!.id },
      });
      const conv2 = await prisma.conversation.findFirst({
        where: { customerId: customer2!.id },
      });

      expect(conv1!.id).not.toBe(conv2!.id);
    });

    it('should handle unknown intent with fallback search', async () => {
      const unknownPayload = {
        message_id: 'test-unknown-001',
        from: '+573006666666',
        timestamp: '2026-02-13T10:20:00Z',
        text: 'asdfghjkl random text',
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(unknownPayload)
        .expect(200);

      expect(response.body.processed).toBe(true);
    });

    it('should not send duplicate responses for duplicate messages', async () => {
      const dupePayload = {
        message_id: 'test-dupe-response-001',
        from: '+573007777777',
        timestamp: '2026-02-13T10:25:00Z',
        text: 'hola',
      };

      // First message - should process and respond
      const response1 = await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(dupePayload)
        .expect(200);

      expect(response1.body.processed).toBe(true);
      expect(response1.body.duplicate).toBeUndefined();

      // Duplicate message - should not reprocess
      const response2 = await request(app.getHttpServer())
        .post('/webhooks/whatsapp/inbound')
        .send(dupePayload)
        .expect(200);

      expect(response2.body.processed).toBe(false);
      expect(response2.body.duplicate).toBe(true);

      // Verify only one inbound message record
      const messages = await prisma.inboundMessage.findMany({
        where: { messageId: dupePayload.message_id },
      });
      expect(messages).toHaveLength(1);
    });
  });
});
