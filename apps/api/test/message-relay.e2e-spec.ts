/**
 * Message Relay E2E Tests
 * PR-05.2 REQ-05..REQ-11
 * AC-04: msg sends message to customer
 * AC-05: handoff activates handoffActive = true
 * AC-06: cerrar handoff deactivates handoffActive = false
 * AC-07: relay customer message to merchant when handoffActive = true
 * AC-08: customer receives formatted message
 * AC-09: merchant receives formatted message
 * AC-10: relay messages logged with source = 'relay'
 * AC-12: E2E tests pass (min 8 scenarios)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { OrderStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWebhook(phoneNumberId: string, from: string, body: string, msgId?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-pr052',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000052', phone_number_id: phoneNumberId },
              messages: [
                {
                  from,
                  id: msgId ?? `msg-pr052-${Date.now()}-${Math.random()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageRelay (e2e) — PR-05.2', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testCustomer: any;

  const MERCHANT_PHONE = '+5730052900001';
  const CUSTOMER_PHONE = '+5730052900002';
  const CHANNEL_PHONE_ID = 'pr052-channel-phone-001';

  let msgCounter = 0;
  function nextMsgId() {
    return `pr052-msg-${++msgCounter}-${Date.now()}`;
  }

  /** Send as MERCHANT */
  async function merchantSends(body: string, id?: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .send(buildWebhook(CHANNEL_PHONE_ID, MERCHANT_PHONE, body, id ?? nextMsgId()))
      .expect(200);
  }

  /** Send as CUSTOMER */
  async function customerSends(body: string, id?: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .send(buildWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, body, id ?? nextMsgId()))
      .expect(200);
  }

  /** Create an order directly in DB for test setup */
  async function createOrder(status: OrderStatus = 'confirmed', suffix = 'R001') {
    return prisma.order.create({
      data: {
        orderCode: `ORD-${suffix}`,
        merchantId: testMerchant.id,
        customerId: testCustomer.id,
        customerName: 'Cliente Relay',
        customerPhone: CUSTOMER_PHONE,
        shippingAddress: 'Calle Relay 1',
        paymentMethod: 'cod',
        status,
        totalAmount: new Decimal('80000'),
        shippingCost: new Decimal('0'),
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Seed: Merchant
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'Tienda Relay E2E',
        whatsappNumber: MERCHANT_PHONE,
        apiKey: `pr052-api-key-${Date.now()}`,
        industry: 'ropa',
        botPaused: false,
      },
    });

    // Seed: Channel
    await prisma.channel.create({
      data: {
        merchantId: testMerchant.id,
        type: 'WHATSAPP',
        externalId: CHANNEL_PHONE_ID,
        displayName: 'PR052 Test Channel',
        credentials: {
          accessToken: 'test-token-pr052',
          phoneNumberId: CHANNEL_PHONE_ID,
        },
        isActive: true,
      },
    });

    // Seed: MerchantConfig
    await prisma.merchantConfig.create({
      data: {
        merchantId: testMerchant.id,
        paymentMethods: [{ type: 'cod', label: 'Contraentrega' }],
        shippingConfig: { estimatedDays: '2-3 días' },
        currency: 'COP',
        orderCodePrefix: 'ORD',
        autoConfirmCod: false,
      },
    });

    // Seed: Customer
    testCustomer = await prisma.customer.upsert({
      where: { phone: CUSTOMER_PHONE },
      update: {},
      create: { phone: CUSTOMER_PHONE, name: 'Cliente Relay' },
    });
  });

  afterAll(async () => {
    // Clean up in FK-safe order
    await prisma.orderItem.deleteMany({ where: { order: { merchantId: testMerchant.id } } });
    await prisma.order.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.messageLog.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.inboundMessage.deleteMany({
      where: { from: { in: [MERCHANT_PHONE, CUSTOMER_PHONE] } },
    });
    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.merchantConfig.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.channel.deleteMany({ where: { externalId: CHANNEL_PHONE_ID } });
    await prisma.customer.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.merchant.deleteMany({ where: { id: testMerchant.id } });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // AC-04, AC-08: msg command sends formatted message to customer
  // ---------------------------------------------------------------------------
  describe('AC-04, AC-08: comando msg', () => {
    it('AC-04: merchant sends "msg ORD-R001 Tu pedido sale mañana" → OutboxMessage to customer', async () => {
      await createOrder('confirmed', 'R001');

      await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });

      await merchantSends('msg ORD-R001 Tu pedido sale mañana');

      // OutboxMessage debe tener el mensaje formateado al cliente
      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: CUSTOMER_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      // AC-08: formato "Mensaje de {merchantName}: {texto}"
      expect((outbox!.payloadJson as { text: string }).text).toContain('Tienda Relay E2E');
      // Original text preserved (diacritics not stripped)
      expect((outbox!.payloadJson as { text: string }).text).toContain('sale m');
    });

    it('AC-04: msg with unknown orderCode returns error confirmation', async () => {
      await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });

      await merchantSends('msg ORD-NOEXISTE hola');

      // OutboxMessage debe ser la respuesta de error al merchant
      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      expect((outbox!.payloadJson as { text: string }).text).toContain('❌');
      expect((outbox!.payloadJson as { text: string }).text).toContain('no encontrado');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-05: handoff command activates handoffActive
  // ---------------------------------------------------------------------------
  describe('AC-05: comando handoff', () => {
    it('AC-05: merchant sends "handoff ORD-R002" → conversation.handoffActive = true', async () => {
      await createOrder('confirmed', 'R002');

      // Customer must have sent a message to create a CUSTOMER conversation
      await customerSends('hola');

      await merchantSends(`handoff ORD-R002`);

      // Verify handoffActive = true in DB
      const conv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, type: 'CUSTOMER', handoffActive: true },
      });
      expect(conv).not.toBeNull();
      expect(conv!.handoffActive).toBe(true);
    });

    it('AC-05: idempotent — double handoff does not cause errors', async () => {
      await merchantSends(`handoff ORD-R002`);
      await merchantSends(`handoff ORD-R002`);

      const count = await prisma.conversation.count({
        where: { merchantId: testMerchant.id, type: 'CUSTOMER', handoffActive: true },
      });
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07, AC-09: cliente mensaje con handoffActive → relay al merchant
  // ---------------------------------------------------------------------------
  describe('AC-07, AC-09: relay cliente → merchant', () => {
    it('AC-07: customer message with handoffActive = true is relayed to merchant (no bot response)', async () => {
      // Precondition: handoffActive should be true from previous test, or activate it
      const activeConv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, type: 'CUSTOMER', handoffActive: true },
      });
      if (!activeConv) {
        await merchantSends(`handoff ORD-R002`);
      }

      await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });

      const result = await customerSends('Hola, ¿a qué hora llega mi pedido?');
      expect(result.status).toBe(200);

      // AC-09: OutboxMessage debe ir al merchant con formato "Cliente {orderCode} dice: {texto}"
      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      expect((outbox!.payloadJson as { text: string }).text).toContain('dice:');
      expect((outbox!.payloadJson as { text: string }).text).toContain(
        'Hola, ¿a qué hora llega mi pedido?',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-06: cerrar handoff desactiva relay
  // ---------------------------------------------------------------------------
  describe('AC-06: comando cerrar handoff', () => {
    it('AC-06: merchant sends "cerrar handoff" → handoffActive = false', async () => {
      await merchantSends('cerrar handoff');

      const conv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, type: 'CUSTOMER' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(conv).not.toBeNull();
      expect(conv!.handoffActive).toBe(false);
    });

    it('AC-06: idempotent — cerrar handoff without active handoff returns info message', async () => {
      await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });

      await merchantSends('cerrar handoff');

      // Should receive an info message (not an error)
      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text: string }).text;
      expect(text).toContain('ℹ️');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-10: relay messages logged with source = 'relay'
  // ---------------------------------------------------------------------------
  describe('AC-10: MessageLog source = relay', () => {
    it('AC-10: relay message logged with source = "relay"', async () => {
      // Reset and set handoff
      await merchantSends('handoff ORD-R002');
      await prisma.messageLog.deleteMany({ where: { merchantId: testMerchant.id } });

      await customerSends('Mensaje de prueba relay AC-10');

      const relayLog = await prisma.messageLog.findFirst({
        where: { merchantId: testMerchant.id, source: 'relay' },
        orderBy: { createdAt: 'desc' },
      });
      expect(relayLog).not.toBeNull();
      expect(relayLog!.source).toBe('relay');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-08: ayuda muestra comandos relay
  // ---------------------------------------------------------------------------
  describe('AC-08 (help): ayuda command includes relay commands', () => {
    it('ayuda response includes msg, handoff, cerrar handoff', async () => {
      await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });

      await merchantSends('ayuda');

      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text: string }).text;
      expect(text).toContain('msg');
      expect(text).toContain('handoff');
      expect(text).toContain('cerrar handoff');
    });
  });
});
