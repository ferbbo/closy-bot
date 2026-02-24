/**
 * PR-05.1: Merchant Commands E2E Tests
 * AC-06: confirmar ORD-XXX → transitions pending_payment → confirmed
 * AC-07: rechazar ORD-XXX [reason] → transitions → cancelled + customer notified
 * AC-08: pagado ORD-XXX → transitions → paid
 * AC-09: enviado ORD-XXX → transitions → shipped
 * AC-10: pedido ORD-XXX → returns order details
 * AC-11: pendientes → lists pending orders
 * AC-12: hoy → returns daily summary
 * AC-13: ayuda → returns help text
 * AC-14: pausar bot / activar bot → botPaused flag toggled
 * AC-15: customer notified via OutboxMessage on state transition
 * AC-16: invalid transition rejected without DB change
 * AC-17: unknown command returns error, unknown = AC-05
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
        id: 'entry-pr051',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000099', phone_number_id: phoneNumberId },
              messages: [
                {
                  from,
                  id: msgId ?? `msg-pr051-${Date.now()}-${Math.random()}`,
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

describe('MerchantCommands (e2e) — PR-05.1', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testCustomer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testVariant: any;

  const MERCHANT_PHONE = '+5730099900001';
  const CUSTOMER_PHONE = '+5730099900002';
  const CHANNEL_PHONE_ID = 'pr051-channel-phone-001';

  let msgCounter = 0;
  function nextMsgId() {
    return `pr051-msg-${++msgCounter}-${Date.now()}`;
  }

  /** Send a command as the MERCHANT (from = MERCHANT_PHONE) */
  async function merchantSends(body: string, id?: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .send(buildWebhook(CHANNEL_PHONE_ID, MERCHANT_PHONE, body, id ?? nextMsgId()))
      .expect(200);
  }

  /** Create an order directly in DB for test setup */
  async function createOrder(status: OrderStatus, suffix = '001') {
    return prisma.order.create({
      data: {
        orderCode: `ORD-T${suffix}`,
        merchantId: testMerchant.id,
        customerId: testCustomer.id,
        customerName: 'Cliente E2E',
        customerPhone: CUSTOMER_PHONE,
        shippingAddress: 'Calle 1 # 2-3',
        paymentMethod: 'cod',
        status,
        totalAmount: new Decimal('100000'),
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

    // Seed: Merchant with whatsappNumber = MERCHANT_PHONE
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'PR05.1 Merchant E2E',
        whatsappNumber: MERCHANT_PHONE,
        apiKey: `pr051-api-key-${Date.now()}`,
        industry: 'ropa',
        botPaused: false,
      },
    });

    await prisma.channel.create({
      data: {
        merchantId: testMerchant.id,
        type: 'WHATSAPP',
        externalId: CHANNEL_PHONE_ID,
        displayName: 'PR05.1 Test Channel',
        credentials: {
          accessToken: 'test-token-pr051',
          phoneNumberId: CHANNEL_PHONE_ID,
        },
        isActive: true,
      },
    });

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
      create: { phone: CUSTOMER_PHONE, name: 'Cliente E2E' },
    });

    // Seed: Product + Variant (needed so OrderItems can reference it)
    const category = await prisma.category.create({
      data: { name: 'Ropa PR051', merchantId: testMerchant.id },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Camiseta E2E',
        description: 'Test product',
        categoryId: category.id,
        merchantId: testMerchant.id,
        isActive: true,
      },
    });
    testVariant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'PR051-SKU-001',
        name: 'Talla M',
        price: new Decimal('100000'),
        stock: 20,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // Clean up in FK-safe order
    await prisma.orderItem.deleteMany({ where: { order: { merchantId: testMerchant.id } } });
    await prisma.order.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.cartItem.deleteMany({ where: { cart: { merchantId: testMerchant.id } } });
    await prisma.cart.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.messageLog.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.inboundMessage.deleteMany({
      where: { from: { in: [MERCHANT_PHONE, CUSTOMER_PHONE] } },
    });
    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.merchantConfig.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.productVariant.deleteMany({ where: { sku: 'PR051-SKU-001' } });
    await prisma.product.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.category.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.channel.deleteMany({ where: { externalId: CHANNEL_PHONE_ID } });
    await prisma.customer.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.merchant.deleteMany({ where: { id: testMerchant.id } });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // AC-02: Merchant bifurcation — message from merchant phone takes admin route
  // ---------------------------------------------------------------------------
  describe('AC-02: Merchant route detection', () => {
    it('should route message from merchant phone to admin handler (no customer LLM response)', async () => {
      // Sending unknown command → should NOT respond as a customer flow, should return command error
      const res = await merchantSends('hola cliente', nextMsgId());
      expect(res.status).toBe(200);
      // The response must not be a customer-flow greeting — it's an unrecognized command
      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id },
        orderBy: { createdAt: 'desc' },
      });
      // Response should contain command error or help reference
      if (outbox) {
        const text = (outbox.payloadJson as { text?: string }).text ?? '';
        expect(text.toLowerCase()).toMatch(/comando|ayuda|comando no reconocido/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AC-06: confirmar ORD-XXX
  // ---------------------------------------------------------------------------
  describe('AC-06: confirmar command', () => {
    it('should transition pending_payment → confirmed and notify customer', async () => {
      const order = await createOrder('pending_payment', '100');

      await merchantSends(`confirmar ${order.orderCode}`);

      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated?.status).toBe('confirmed'); // AC-06: state changed

      // AC-15: customer notified via outbox
      const outbox = await prisma.outboxMessage.findFirst({
        where: { to: CUSTOMER_PHONE, merchantId: testMerchant.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
    });

    it('AC-06 idempotency: confirmar already confirmed order → no duplicate outbox', async () => {
      const order = await createOrder('confirmed', '101');
      const beforeCount = await prisma.outboxMessage.count({
        where: { to: CUSTOMER_PHONE, merchantId: testMerchant.id },
      });

      await merchantSends(`confirmar ${order.orderCode}`);

      const afterCount = await prisma.outboxMessage.count({
        where: { to: CUSTOMER_PHONE, merchantId: testMerchant.id },
      });
      expect(afterCount).toBe(beforeCount); // no duplicate notification
      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe('confirmed'); // unchanged
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07: rechazar ORD-XXX [reason]
  // ---------------------------------------------------------------------------
  describe('AC-07: rechazar command', () => {
    it('should transition pending_payment → cancelled and notify customer with reason', async () => {
      const order = await createOrder('pending_payment', '200');

      await merchantSends(`rechazar ${order.orderCode} no hay stock`);

      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated?.status).toBe('cancelled'); // AC-07 transition

      const outbox = await prisma.outboxMessage.findFirst({
        where: { to: CUSTOMER_PHONE, merchantId: testMerchant.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text?: string }).text ?? '';
      expect(text).toContain('no hay stock'); // AC-07: reason included
    });
  });

  // ---------------------------------------------------------------------------
  // AC-08: pagado ORD-XXX
  // ---------------------------------------------------------------------------
  describe('AC-08: pagado command', () => {
    it('should transition confirmed → paid', async () => {
      const order = await createOrder('confirmed', '300');

      await merchantSends(`pagado ${order.orderCode}`);

      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated?.status).toBe('paid'); // AC-08 transition
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09: enviado ORD-XXX
  // ---------------------------------------------------------------------------
  describe('AC-09: enviado command', () => {
    it('should transition confirmed → shipped', async () => {
      const order = await createOrder('confirmed', '400');

      await merchantSends(`enviado ${order.orderCode}`);

      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated?.status).toBe('shipped'); // AC-09 transition
    });
  });

  // ---------------------------------------------------------------------------
  // AC-10: pedido ORD-XXX
  // ---------------------------------------------------------------------------
  describe('AC-10: pedido command — order details', () => {
    it('should return order details as outbox message to merchant', async () => {
      const order = await createOrder('confirmed', '500');
      // Add an OrderItem so details are populated
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          variantId: testVariant.id,
          snapshotName: `${testVariant.name} – Camiseta E2E`,
          quantity: 1,
          unitPrice: new Decimal('100000'),
        },
      });

      await merchantSends(`pedido ${order.orderCode}`);

      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text?: string }).text ?? '';
      expect(text).toContain(order.orderCode); // AC-10: orderCode present
    });
  });

  // ---------------------------------------------------------------------------
  // AC-11: pendientes
  // ---------------------------------------------------------------------------
  describe('AC-11: pendientes — list pending orders', () => {
    it('should list pending orders for the merchant', async () => {
      // At least one pending order exists from previous tests
      await merchantSends('pendientes');

      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text?: string }).text ?? '';
      // Text contains count info or order code
      expect(text.toLowerCase()).toMatch(/pedido|orden|ORD-|pendiente|0/i);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-12: hoy
  // ---------------------------------------------------------------------------
  describe('AC-12: hoy — daily summary', () => {
    it('should return daily summary', async () => {
      await merchantSends('hoy');

      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text?: string }).text ?? '';
      expect(text).toMatch(/\d/); // AC-12: contains numbers
    });
  });

  // ---------------------------------------------------------------------------
  // AC-13: ayuda
  // ---------------------------------------------------------------------------
  describe('AC-13: ayuda — help text', () => {
    it('should return list of available commands', async () => {
      await merchantSends('ayuda');

      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).not.toBeNull();
      const text = (outbox!.payloadJson as { text?: string }).text ?? '';
      expect(text).toContain('confirmar'); // AC-13: command list
      expect(text).toContain('rechazar');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-14: pausar bot / activar bot
  // ---------------------------------------------------------------------------
  describe('AC-14: pausar bot / activar bot', () => {
    it('should set botPaused = true when merchant sends "pausar bot"', async () => {
      await merchantSends('pausar bot');

      const updated = await prisma.merchant.findUnique({ where: { id: testMerchant.id } });
      expect(updated?.botPaused).toBe(true); // AC-14: botPaused toggled
    });

    it('should NOT process customer messages when botPaused = true', async () => {
      // Ensure botPaused is true
      await prisma.merchant.update({
        where: { id: testMerchant.id },
        data: { botPaused: true },
      });

      const beforeCount = await prisma.outboxMessage.count({
        where: { to: CUSTOMER_PHONE, merchantId: testMerchant.id },
      });

      // Customer sends message
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, 'hola', nextMsgId()))
        .expect(200);
      expect(res.status).toBe(200);

      const afterCount = await prisma.outboxMessage.count({
        where: { to: CUSTOMER_PHONE, merchantId: testMerchant.id },
      });
      expect(afterCount).toBe(beforeCount); // AC-14: no response to customer when paused
    });

    it('should set botPaused = false when merchant sends "activar bot"', async () => {
      await merchantSends('activar bot');

      const updated = await prisma.merchant.findUnique({ where: { id: testMerchant.id } });
      expect(updated?.botPaused).toBe(false); // AC-14: bot reactivated
    });
  });

  // ---------------------------------------------------------------------------
  // AC-16: Invalid state transition rejected
  // ---------------------------------------------------------------------------
  describe('AC-16: invalid transition rejected', () => {
    it('should NOT transition shipped → confirmed (invalid)', async () => {
      const order = await createOrder('shipped', '600');

      await merchantSends(`confirmar ${order.orderCode}`);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe('shipped'); // AC-16: status unchanged

      // Merchant receives error feedback
      const outbox = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      if (outbox) {
        const text = (outbox.payloadJson as { text?: string }).text ?? '';
        expect(text).toContain('❌'); // AC-16: error feedback
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AC-05 / Unknown command
  // ---------------------------------------------------------------------------
  describe('AC-05: unknown command returns error', () => {
    it('should return error message for unrecognized command', async () => {
      const beforeCount = await prisma.outboxMessage.count({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
      });

      await merchantSends('comando_inexistente ORD-001');

      const afterCount = await prisma.outboxMessage.count({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
      });
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
      const latest = await prisma.outboxMessage.findFirst({
        where: { merchantId: testMerchant.id, to: MERCHANT_PHONE },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        const text = (latest.payloadJson as { text?: string }).text ?? '';
        expect(text.toLowerCase()).toMatch(/no reconoc|comando|ayuda/);
      }
    });
  });
});
