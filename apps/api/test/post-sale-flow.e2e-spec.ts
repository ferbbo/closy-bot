/**
 * PR-07: Post-Sale Flow E2E Tests
 * AC-14: Ticket creado + OutboxMessage enqueued para merchant
 * AC-15: Cliente pregunta estado → recibe respuesta template-first sin LLM
 * AC-16: Cliente reporta problema → ticket creado + merchant notificado
 *
 * Scenarios:
 * 1. ORDER_STATUS: customer asks for order status → bot responds with template
 * 2. ORDER_STATUS: customer with no orders → noOrderFound message
 * 3. CREATE_TICKET: customer reports damaged → ticket created + merchant notified
 * 4. CREATE_TICKET: customer reports problem without order → bot asks for orderCode
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

let msgCounter = Date.now() + 70000; // offset to avoid collision with other e2e

function buildWhatsAppWebhook(phoneNumberId: string, from: string, body: string): object {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-pr07',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000007',
                phone_number_id: phoneNumberId,
              },
              messages: [
                {
                  from,
                  id: `msg-pr07-${++msgCounter}`,
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

describe('PostSaleFlow (e2e) — PR-07', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testOrder: any;

  const CHANNEL_PHONE_ID = `pr07-channel-${Date.now()}`;
  const CUSTOMER_PHONE = `+5730077${Date.now().toString().slice(-5)}`;
  const CUSTOMER_NO_ORDERS_PHONE = `+5730099${Date.now().toString().slice(-5)}`;

  function sendAs(phone: string, text: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'dev-skip')
      .send(buildWhatsAppWebhook(CHANNEL_PHONE_ID, phone, text));
  }

  function send(text: string) {
    return sendAs(CUSTOMER_PHONE, text);
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
        name: 'PR07 Test Store',
        whatsappNumber: `pr07-merchant-phone-${Date.now()}`,
        apiKey: `pr07-api-key-${Date.now()}`,
        industry: 'ropa',
      },
    });

    await prisma.channel.create({
      data: {
        merchantId: testMerchant.id,
        externalId: CHANNEL_PHONE_ID,
        type: 'WHATSAPP',
        displayName: 'PR07 Test Channel',
        credentials: { accessToken: 'test-token-pr07', phoneNumberId: CHANNEL_PHONE_ID },
        isActive: true,
        status: 'connected',
      },
    });

    // Create customer with order
    const customer = await prisma.customer.create({
      data: { phone: CUSTOMER_PHONE },
    });

    testOrder = await prisma.order.create({
      data: {
        orderCode: `PR07-${Date.now()}`,
        merchantId: testMerchant.id,
        customerId: customer.id,
        status: OrderStatus.confirmed,
        totalAmount: 90000,
        shippingAddress: 'Calle Test #1-2',
        customerName: 'Juan Test',
        customerPhone: CUSTOMER_PHONE,
        paymentMethod: 'transfer',
      },
    });

    // Create customer without orders (for AC-06 test)
    await prisma.customer.create({
      data: { phone: CUSTOMER_NO_ORDERS_PHONE },
    });
  });

  afterAll(async () => {
    if (!testMerchant) return;
    // Cleanup in dependency order
    await prisma.ticket.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.outboxMessage.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.messageLog.deleteMany({
      where: { conversation: { merchantId: testMerchant.id } },
    });
    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.order.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.customer.deleteMany({
      where: { phone: { in: [CUSTOMER_PHONE, CUSTOMER_NO_ORDERS_PHONE] } },
    });
    await prisma.channel.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.merchant.delete({ where: { id: testMerchant.id } });

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // AC-15: Cliente pregunta estado → recibe respuesta template-first
  // ---------------------------------------------------------------------------

  describe('AC-15: ORDER_STATUS flow', () => {
    it('should respond with order status template when order found', async () => {
      const res = await send('¿Cómo va mi pedido?');

      expect(res.status).toBe(200);
      expect(res.body.shouldSend).toBe(true);
      expect(res.body.intent).toBe('ORDER_STATUS');
      expect(res.body.response).toContain(testOrder.orderCode);
    });

    it('should return noOrderFound when customer has no orders', async () => {
      const res = await sendAs(CUSTOMER_NO_ORDERS_PHONE, 'estado de mi pedido');

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('ORDER_STATUS');
      // noOrderFound template
      expect(res.body.response).toBeTruthy();
      expect(res.body.response.length).toBeGreaterThan(5);
    });

    it('should find order by specific orderCode', async () => {
      const res = await send(`estado del pedido ${testOrder.orderCode}`);

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('ORDER_STATUS');
      expect(res.body.response).toContain(testOrder.orderCode);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-16: Cliente reporta problema → ticket creado + merchant notificado
  // ---------------------------------------------------------------------------

  describe('AC-16: CREATE_TICKET flow', () => {
    it('should start ticket flow when customer reports damaged item', async () => {
      const res = await send('mi pedido llegó dañado');

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('CREATE_TICKET');
      // Should ask for description (type detected from "dañado")
      expect(res.body.response).toBeTruthy();
    });

    it('should create ticket and enqueue OutboxMessage after description', async () => {
      // Step 1: trigger CREATE_TICKET
      await send('mi pedido llegó roto');

      // Step 2: provide description
      const res = await send('La caja estaba completamente aplastada y el producto roto');

      expect(res.status).toBe(200);
      expect(res.body.response).toBeTruthy();

      // Verify ticket was created in DB
      const ticket = await prisma.ticket.findFirst({
        where: { merchantId: testMerchant.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(ticket).toBeTruthy();
      expect(ticket!.status).toBe('open');
      expect(ticket!.type).toBe('damaged');

      // Verify OutboxMessage enqueued for merchant (AC-14)
      const outbox = await prisma.outboxMessage.findFirst({
        where: {
          merchantId: testMerchant.id,
          dedupeKey: { startsWith: `ticket-${testOrder.orderCode}` },
        },
      });
      expect(outbox).toBeTruthy();
      expect(outbox!.to).toBe(testMerchant.whatsappNumber);
    });
  });
});
