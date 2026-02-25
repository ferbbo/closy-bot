/**
 * PR-06: Payment Fallback Flow E2E Tests
 * AC-10: PaymentFallbackFlow completo (PAGADO → ASK_ORDER_CODE → ASK_CONFIRM → COMPLETED)
 * AC-11: paymentIntentId = "manual_{orderId}_{timestamp}" generado por PaymentService
 * AC-13: Order ya pagada → graceful message
 *
 * 4 escenarios:
 * 1. Confirmación completa (successful path)
 * 2. Orden inválida (order not found)
 * 3. Orden ya pagada (graceful returning paid)
 * 4. Cancelación en paso ASK_CONFIRM
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let msgCounter = Date.now();

function buildWhatsAppWebhook(phoneNumberId: string, from: string, body: string): object {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-pr06-fb',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000002',
                phone_number_id: phoneNumberId,
              },
              messages: [
                {
                  from,
                  id: `msg-pr06-fb-${++msgCounter}`,
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

describe('PaymentFallbackFlow (e2e) — PR-06', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testOrder: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paidOrder: any;

  const CHANNEL_PHONE_ID = 'pr06-fb-channel-001';
  const CUSTOMER_PHONE = `+5730011${Date.now().toString().slice(-5)}`;

  function sendMessage(text: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'dev-skip')
      .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, CUSTOMER_PHONE, text));
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create merchant + channel
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'PR06-FB Test Store',
        whatsappNumber: `pr06fb-merchant-${Date.now()}`,
        apiKey: `pr06-fb-api-key-${Date.now()}`,
        industry: 'ropa',
      },
    });

    await prisma.channel.create({
      data: {
        merchantId: testMerchant.id,
        phoneNumberId: CHANNEL_PHONE_ID,
        displayName: 'PR06 FB Test Channel',
        accessToken: 'test-token-pr06fb',
        wabaId: 'test-waba-pr06fb',
        isActive: true,
        status: 'active',
      },
    });

    // Create customer + conversation will be auto-created by orchestrator
    const customer = await prisma.customer.create({
      data: { phone: CUSTOMER_PHONE },
    });

    const ts = Date.now();

    // Pending payment order — used in scenario 1, 4
    testOrder = await prisma.order.create({
      data: {
        orderCode: `PR06FB-${ts}`,
        merchantId: testMerchant.id,
        customerId: customer.id,
        status: OrderStatus.pending_payment,
        totalAmount: 75000,
        shippingAddress: 'Calle 10 #5-6',
        customerName: 'Test Customer',
        customerPhone: CUSTOMER_PHONE,
        paymentMethod: 'transfer',
      },
    });

    // Already paid order — used in scenario 3
    paidOrder = await prisma.order.create({
      data: {
        orderCode: `PR06FB-PAID-${ts}`,
        merchantId: testMerchant.id,
        customerId: customer.id,
        status: OrderStatus.paid,
        totalAmount: 50000,
        shippingAddress: 'Calle 20 #7-8',
        customerName: 'Test Customer',
        customerPhone: CUSTOMER_PHONE,
        paymentMethod: 'transfer',
      },
    });
  });

  afterAll(async () => {
    // Cleanup in dependency order
    await prisma.payment.deleteMany({ where: { orderId: testOrder.id } });
    await prisma.payment.deleteMany({ where: { orderId: paidOrder.id } });
    await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.messageLog.deleteMany({ where: { conversation: { merchantId: testMerchant.id } } });
    await prisma.conversationMemory.deleteMany({
      where: { conversation: { merchantId: testMerchant.id } },
    });
    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.order.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.customer.deleteMany({ where: { phone: CUSTOMER_PHONE } });
    await prisma.channel.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.merchant.deleteMany({ where: { id: testMerchant.id } });
    await app.close();
  });

  // Reset conversation state between scenarios
  async function clearPaymentFallbackState() {
    const conversation = await prisma.conversation.findFirst({
      where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
    });
    if (!conversation) return;
    const meta = (conversation.metadata ?? {}) as Record<string, unknown>;
    delete meta['payment_fallback'];
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { metadata: meta },
    });
  }

  // Reset order to pending_payment (after scenario 1 marks it as paid)
  async function resetOrderToPending(orderId: string) {
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.pending_payment },
    });
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: AC-10 Complete confirmation (happy path)
  // ---------------------------------------------------------------------------
  describe('AC-10 Scenario 1: Complete confirmation (happy path)', () => {
    beforeEach(async () => {
      await clearPaymentFallbackState();
      await resetOrderToPending(testOrder.id);
    });

    it('AC-10: should complete full payment fallback flow in 3 messages', async () => {
      // Step 1: trigger CONFIRM_PAYMENT intent
      const res1 = await sendMessage('pagado');
      expect(res1.status).toBe(200);

      // Bot asks for order code — check state persisted
      const conv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      expect(conv).toBeTruthy();
      const meta = conv!.metadata as Record<string, unknown>;
      const state = meta['payment_fallback'] as { step: string };
      expect(state).toBeTruthy();
      expect(state.step).toBe('ASK_ORDER_CODE');

      // Step 2: provide order code
      const res2 = await sendMessage(testOrder.orderCode);
      expect(res2.status).toBe(200);

      // State should advance to ASK_CONFIRM
      const conv2 = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      const meta2 = conv2!.metadata as Record<string, unknown>;
      const state2 = meta2['payment_fallback'] as { step: string; orderId: string };
      expect(state2.step).toBe('ASK_CONFIRM');
      expect(state2.orderId).toBe(testOrder.id);

      // Step 3: confirm
      const res3 = await sendMessage('confirmar');
      expect(res3.status).toBe(200);

      // AC-10: State should be COMPLETED
      const conv3 = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      const meta3 = conv3!.metadata as Record<string, unknown>;
      const state3 = meta3['payment_fallback'] as { step: string } | undefined;
      // State is cleared (null) or COMPLETED
      expect(!state3 || state3.step === 'COMPLETED').toBe(true);

      // AC-11: Payment created with manual_{orderId}_ prefix
      const payment = await prisma.payment.findFirst({ where: { orderId: testOrder.id } });
      expect(payment).toBeTruthy();
      expect(payment!.paymentIntentId).toMatch(/^manual_/);
      expect(payment!.status).toBe('confirmed');

      // Order transitioned to paid
      const order = await prisma.order.findUnique({ where: { id: testOrder.id } });
      expect(order!.status).toBe(OrderStatus.paid);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Invalid order (order not found)
  // ---------------------------------------------------------------------------
  describe('AC-10 Scenario 2: Invalid order code', () => {
    beforeEach(async () => {
      await clearPaymentFallbackState();
    });

    it('AC-10: should show error message for invalid order code and stay in ASK_ORDER_CODE', async () => {
      // Trigger flow
      await sendMessage('ya pague');

      // Send non-existent code
      await sendMessage('ORD-INVALID-999999');

      // State should remain ASK_ORDER_CODE (not cleared)
      const conv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      const meta = conv!.metadata as Record<string, unknown>;
      const state = meta['payment_fallback'] as { step: string } | undefined;
      // Flow remains active for retry
      expect(state).toBeTruthy();
      expect(state!.step).toBe('ASK_ORDER_CODE');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: AC-13 Already paid order
  // ---------------------------------------------------------------------------
  describe('AC-13 Scenario 3: Already paid order graceful', () => {
    beforeEach(async () => {
      await clearPaymentFallbackState();
    });

    it('AC-13: should return graceful message for already paid order and clear state', async () => {
      // Trigger flow
      await sendMessage('hice el pago');

      // Send code of PAID order
      await sendMessage(paidOrder.orderCode);

      // State should be cleared (order already paid → flow ends gracefully)
      const conv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      const meta = conv!.metadata as Record<string, unknown>;
      const state = meta['payment_fallback'] as { step: string } | undefined;
      // State cleared after graceful handling
      expect(!state || state.step === 'COMPLETED').toBe(true);

      // Paid order should remain paid (not duplicated)
      const order = await prisma.order.findUnique({ where: { id: paidOrder.id } });
      expect(order!.status).toBe(OrderStatus.paid);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Cancellation at ASK_CONFIRM step
  // ---------------------------------------------------------------------------
  describe('AC-10 Scenario 4: Cancellation at ASK_CONFIRM', () => {
    beforeEach(async () => {
      await clearPaymentFallbackState();
      await resetOrderToPending(testOrder.id);
    });

    it('AC-10: should clear state and confirm cancellation when user cancels at ASK_CONFIRM', async () => {
      // Trigger flow
      await sendMessage('transferí');

      // Provide valid order code
      await sendMessage(testOrder.orderCode);

      // Should be in ASK_CONFIRM now
      const conv = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      const meta = conv!.metadata as Record<string, unknown>;
      const midState = meta['payment_fallback'] as { step: string };
      expect(midState.step).toBe('ASK_CONFIRM');

      // Cancel
      await sendMessage('cancelar');

      // State should be cleared
      const conv2 = await prisma.conversation.findFirst({
        where: { merchantId: testMerchant.id, customer: { phone: CUSTOMER_PHONE } },
      });
      const meta2 = conv2!.metadata as Record<string, unknown>;
      const finalState = meta2['payment_fallback'] as { step: string } | undefined;
      expect(!finalState || finalState.step === 'COMPLETED').toBe(true);

      // No payment created
      const payment = await prisma.payment.findFirst({ where: { orderId: testOrder.id } });
      expect(payment).toBeNull();

      // Order still pending_payment
      const order = await prisma.order.findUnique({ where: { id: testOrder.id } });
      expect(order!.status).toBe(OrderStatus.pending_payment);
    });
  });
});
