/**
 * PR-05: Checkout Flow E2E Tests
 * AC-06: State persists between messages
 * AC-07: Flow completes in order (name → address → payment → confirm)
 * AC-08: Payment methods shown from MerchantConfig
 * AC-10: Cart.status = completed after order
 * AC-13: Reject checkout if cart empty
 * AC-15: Full checkout flow creates order + notifies merchant
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { CartStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWhatsAppWebhook(phoneNumberId: string, from: string, body: string, msgId?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-pr05',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000001',
                phone_number_id: phoneNumberId,
              },
              messages: [
                {
                  from,
                  id: msgId ?? `msg-pr05-${Date.now()}`,
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

describe('CheckoutFlow (e2e) — PR-05', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testCustomer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testVariant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testVariant2: any;

  const CUSTOMER_PHONE = '+573001110001';
  const CHANNEL_PHONE_ID = 'pr05-channel-phone-001';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // -----------------------------------------------------------------------
    // Seed: Merchant + Channel + MerchantConfig
    // -----------------------------------------------------------------------
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'PR05 Test Store',
        whatsappNumber: CUSTOMER_PHONE + '-merchant', // Merchant own number
        apiKey: `pr05-api-key-${Date.now()}`,
        industry: 'ropa',
      },
    });

    await prisma.channel.create({
      data: {
        merchantId: testMerchant.id,
        type: 'WHATSAPP',
        externalId: CHANNEL_PHONE_ID,
        displayName: 'PR05 Test Channel',
        credentials: {
          accessToken: 'test-token-pr05',
          phoneNumberId: CHANNEL_PHONE_ID,
        },
        isActive: true,
      },
    });

    // Create MerchantConfig with payment methods (AC-08)
    await prisma.merchantConfig.create({
      data: {
        merchantId: testMerchant.id,
        paymentMethods: [
          { type: 'cod', label: 'Contraentrega' },
          { type: 'transfer', label: 'Transferencia bancaria' },
        ],
        shippingConfig: { estimatedDays: '2-3 días' },
        currency: 'COP',
        orderCodePrefix: 'ORD',
        autoConfirmCod: true,
      },
    });

    // -----------------------------------------------------------------------
    // Seed: Customer + Product + Variant
    // -----------------------------------------------------------------------
    testCustomer = await prisma.customer.upsert({
      where: { phone: CUSTOMER_PHONE },
      update: {},
      create: { phone: CUSTOMER_PHONE, name: 'PR05 Customer' },
    });

    const category = await prisma.category.create({
      data: { name: 'Ropa PR05', merchantId: testMerchant.id },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Camiseta PR05',
        description: 'Camiseta de test',
        categoryId: category.id,
        merchantId: testMerchant.id,
        isActive: true,
      },
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'PR05-SKU-001',
        name: 'Talla M',
        price: new Decimal(60000),
        stock: 10,
        isActive: true,
      },
    });

    testVariant2 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'PR05-SKU-002',
        name: 'Talla L',
        price: new Decimal(60000),
        stock: 10,
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
    await prisma.inboundMessage.deleteMany({ where: { from: CUSTOMER_PHONE } });
    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.merchantConfig.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.productVariant.deleteMany({
      where: { sku: { in: ['PR05-SKU-001', 'PR05-SKU-002'] } },
    });
    await prisma.product.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.category.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.channel.deleteMany({ where: { externalId: CHANNEL_PHONE_ID } });
    await prisma.customer.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.merchant.deleteMany({ where: { id: testMerchant.id } });
    await app.close();
  });

  // Helper to send webhook and get unique message IDs
  let msgCounter = 0;
  function nextMsgId() {
    return `pr05-msg-${++msgCounter}-${Date.now()}`;
  }

  // -------------------------------------------------------------------------
  // AC-13: Reject checkout if cart empty
  // -------------------------------------------------------------------------

  describe('AC-13: should reject checkout if cart is empty', () => {
    it('should return empty cart message when no active cart exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, 'quiero pagar', nextMsgId()))
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify no order was created
      const orders = await prisma.order.findMany({
        where: { merchantId: testMerchant.id },
      });
      expect(orders).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // AC-06 / AC-07 / AC-08 / AC-10 / AC-15: Full checkout flow
  // -------------------------------------------------------------------------

  describe('AC-15: should complete full checkout flow and create order', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cart: any;

    beforeAll(async () => {
      // Create cart with 2 items (AC-07 prerequisite)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      cart = await prisma.cart.create({
        data: {
          customerId: testCustomer.id,
          merchantId: testMerchant.id,
          status: CartStatus.active,
          expiresAt,
          items: {
            create: [
              { variantId: testVariant.id, quantity: 2, priceSnapshot: new Decimal(60000) },
              { variantId: testVariant2.id, quantity: 1, priceSnapshot: new Decimal(60000) },
            ],
          },
        },
      });
    });

    it('Step 1 — quiero pagar → asks for name', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, 'quiero pagar', nextMsgId()))
        .expect(200);

      expect(res.body.received).toBe(true);

      // Verify checkout state was initialized
      const conversation = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customerId: testCustomer.id },
      });
      expect(conversation).toBeTruthy();

      // State should be in metadata
      const meta = conversation!.metadata as Record<string, unknown>;
      expect(meta?.checkout).toBeTruthy();
      const checkoutState = meta?.checkout as Record<string, unknown>;
      expect(checkoutState.step).toBe('ASK_NAME');
    });

    it('AC-06: State persists — Step 2 — send name → asks for address', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, 'Test User Name', nextMsgId()))
        .expect(200);

      expect(res.body.received).toBe(true);

      // Verify state advanced to ASK_ADDRESS
      const conversation = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customerId: testCustomer.id },
      });
      const meta = conversation!.metadata as Record<string, unknown>;
      const checkoutState = meta?.checkout as Record<string, unknown>;
      expect(checkoutState.step).toBe('ASK_ADDRESS');
    });

    it('AC-06: State persists — Step 3 — send address → shows payment methods', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(
          buildWhatsAppWebhook(
            CHANNEL_PHONE_ID,
            CUSTOMER_PHONE,
            'Test Address 123 Bogotá',
            nextMsgId(),
          ),
        )
        .expect(200);

      expect(res.body.received).toBe(true);

      // Verify state advanced to SELECT_PAYMENT
      const conversation = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customerId: testCustomer.id },
      });
      const meta = conversation!.metadata as Record<string, unknown>;
      const checkoutState = meta?.checkout as Record<string, unknown>;
      expect(checkoutState.step).toBe('SELECT_PAYMENT');
    });

    it('AC-08: Step 4 — select payment method "1" → shows confirmation', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, '1', nextMsgId()))
        .expect(200);

      expect(res.body.received).toBe(true);

      // Verify state advanced to CONFIRM
      const conversation = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customerId: testCustomer.id },
      });
      const meta = conversation!.metadata as Record<string, unknown>;
      const checkoutState = meta?.checkout as Record<string, unknown>;
      expect(checkoutState.step).toBe('CONFIRM');
    });

    it('AC-10 / AC-15: Step 5 — confirmar → order created + cart completed', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, 'confirmar', nextMsgId()))
        .expect(200);

      // AC-15: Verify order was created
      const order = await prisma.order.findFirst({
        where: { merchantId: testMerchant.id },
        include: { items: true },
      });

      expect(order).toBeTruthy();
      expect(order!.status).toBe('pending_payment');
      expect(order!.orderCode).toMatch(/^ORD-\d{3}$/);
      expect(order!.customerName).toBe('Test User Name');
      expect(order!.shippingAddress).toBe('Test Address 123 Bogotá');
      expect(order!.paymentMethod).toBe('cod');

      // AC-09: Verify order items have snapshots
      expect(order!.items).toHaveLength(2);
      for (const item of order!.items) {
        expect(item.snapshotName).toBeTruthy();
        expect(Number(item.unitPrice)).toBeGreaterThan(0);
      }

      // AC-10: Verify cart is completed
      const updatedCart = await prisma.cart.findUnique({ where: { id: cart.id } });
      expect(updatedCart!.status).toBe('completed');

      // AC-11: Verify merchant notification was enqueued
      const notif = await prisma.outboxMessage.findFirst({
        where: {
          merchantId: testMerchant.id,
          dedupeKey: `new-order-${order!.orderCode}-${testMerchant.id}`,
        },
      });
      expect(notif).toBeTruthy();
    });

    it('AC-06: state is COMPLETED after order creation', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customerId: testCustomer.id },
      });
      const meta = conversation!.metadata as Record<string, unknown>;
      const checkoutState = meta?.checkout as Record<string, unknown>;
      expect(checkoutState.step).toBe('COMPLETED');
    });
  });

  // -------------------------------------------------------------------------
  // Edge case: invalid payment selection retries
  // -------------------------------------------------------------------------

  describe('should handle invalid payment method selection with retries', () => {
    beforeAll(async () => {
      // Create a fresh customer + cart for this test
      await prisma.customer.upsert({
        where: { phone: '+573001110099' },
        update: {},
        create: { phone: '+573001110099', name: 'Retry Test Customer' },
      });

      const cust = await prisma.customer.findUniqueOrThrow({
        where: { phone: '+573001110099' },
      });

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.cart.create({
        data: {
          customerId: cust.id,
          merchantId: testMerchant.id,
          status: CartStatus.active,
          expiresAt,
          items: {
            create: [{ variantId: testVariant.id, quantity: 1, priceSnapshot: new Decimal(60000) }],
          },
        },
      });
    });

    afterAll(async () => {
      await prisma.inboundMessage.deleteMany({ where: { from: '+573001110099' } });
      await prisma.messageLog.deleteMany({
        where: {
          conversation: {
            customerId: {
              in: (await prisma.customer.findMany({ where: { phone: '+573001110099' } })).map(
                (c) => c.id,
              ),
            },
          },
        },
      });
      await prisma.cart.deleteMany({ where: { customer: { phone: '+573001110099' } } });
      await prisma.conversation.deleteMany({ where: { customer: { phone: '+573001110099' } } });
      await prisma.customer.deleteMany({ where: { phone: '+573001110099' } });
    });

    it('should cancel checkout after 3 invalid payment selections', async () => {
      const RETRY_PHONE = '+573001110099';

      // Start checkout
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, RETRY_PHONE, 'quiero pagar', nextMsgId()))
        .expect(200);

      // Provide name
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, RETRY_PHONE, 'Retry User', nextMsgId()))
        .expect(200);

      // Provide address
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, RETRY_PHONE, 'Retry Address 456', nextMsgId()))
        .expect(200);

      // Invalid selection x3
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/webhooks/whatsapp')
          .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, RETRY_PHONE, 'invalid_payment', nextMsgId()))
          .expect(200);
      }

      // State should be reset (COMPLETED or null) after 3 invalid attempts
      const conv = await prisma.conversation.findFirst({
        where: { customer: { phone: RETRY_PHONE }, merchantId: testMerchant.id },
      });

      if (conv?.metadata) {
        const meta = conv.metadata as Record<string, unknown>;
        const checkoutState = meta?.checkout as Record<string, unknown> | undefined;
        // After reset, either state is null or COMPLETED
        if (checkoutState) {
          expect(['COMPLETED', undefined]).toContain(checkoutState.step);
        }
      }
    });
  });
});
