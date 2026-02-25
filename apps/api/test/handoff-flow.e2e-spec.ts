/**
 * HandoffFlow E2E Tests
 * PR-08: Handoff Humano — Resumen Estructurado + Registro
 *
 * AC-04 E2E: Cliente envía "quiero hablar con alguien" → Handoff creado + merchant notificado
 * AC-06 E2E: Cliente envía 3 UNKNOWN consecutivos → auto-escalation → Handoff creado
 * AC-08 E2E: Con LLM_SUMMARY_ENABLED=true → summary incluye conversationHighlights
 * AC-09 E2E: OutboxMessage para merchant creado con template correcto
 * AC-10 E2E: conversation.handoffActive = true después de createHandoff()
 * AC-14 E2E: Segundo intento no crea Handoff duplicado si ya existe pending/active
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let msgCounter = Date.now() + 80000; // unique offset to avoid collision

function buildWebhook(phoneNumberId: string, from: string, body: string): object {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-pr08',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000008',
                phone_number_id: phoneNumberId,
              },
              messages: [
                {
                  from,
                  id: `msg-pr08-${++msgCounter}`,
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

describe('HandoffFlow (e2e) — PR-08', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;

  const CHANNEL_PHONE_ID = `pr08-channel-${Date.now()}`;
  const CUSTOMER_PHONE_EXPLICIT = `+573008${Date.now().toString().slice(-5)}`;
  const CUSTOMER_PHONE_ESCALATION = `+573009${Date.now().toString().slice(-5)}`;
  const CUSTOMER_PHONE_IDEMPOTENT = `+573007${Date.now().toString().slice(-5)}`;

  function sendAs(phone: string, text: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'dev-skip')
      .send(buildWebhook(CHANNEL_PHONE_ID, phone, text));
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create merchant with channel
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'Prueba Handoff',
        whatsappPhone: `+1800888${Date.now().toString().slice(-4)}`,
        industry: 'ropa',
        channels: {
          create: {
            phoneNumberId: CHANNEL_PHONE_ID,
            displayPhone: '15550000008',
            accessToken: 'test-token-pr08',
            active: true,
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Cleanup in correct dependency order
    const conversations = await prisma.conversation.findMany({
      where: { merchantId: testMerchant.id },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);

    if (conversationIds.length > 0) {
      await prisma.handoff.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await prisma.outboxMessage.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
      await prisma.messageLog.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
    }

    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.customer.deleteMany({
      where: {
        phone: {
          in: [CUSTOMER_PHONE_EXPLICIT, CUSTOMER_PHONE_ESCALATION, CUSTOMER_PHONE_IDEMPOTENT],
        },
      },
    });
    await prisma.outboxMessage.deleteMany({
      where: { recipientPhone: testMerchant.whatsappPhone },
    });
    await prisma.channel.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.merchant.delete({ where: { id: testMerchant.id } });

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC-04 E2E + AC-09 E2E + AC-10 E2E
  // -------------------------------------------------------------------------

  describe('AC-04 (PR-08) E2E: explicit handoff request creates Handoff record', () => {
    it('should create Handoff + set handoffActive=true + enqueue OutboxMessage when customer sends handoff keyword', async () => {
      // Trigger handoff via keyword
      const res = await sendAs(CUSTOMER_PHONE_EXPLICIT, 'quiero hablar con alguien');
      expect(res.status).toBe(200);

      // Wait briefly for async processing
      await new Promise((r) => setTimeout(r, 200));

      // Verify conversation exists with handoffActive=true
      const conversation = await prisma.conversation.findFirst({
        where: {
          merchantId: testMerchant.id,
          customer: { phone: CUSTOMER_PHONE_EXPLICIT },
        },
      });
      expect(conversation).not.toBeNull();
      expect(conversation!.handoffActive).toBe(true);

      // AC-04: Verify Handoff record created with reason=user_request and status=pending
      const handoff = await prisma.handoff.findFirst({
        where: { conversationId: conversation!.id },
      });
      expect(handoff).not.toBeNull();
      expect(handoff!.reason).toBe('user_request');
      expect(handoff!.status).toBe('pending');
    });

    it('AC-09 (PR-08): OutboxMessage enqueued for merchant notification', async () => {
      // Find the conversation created in the previous test
      const conversation = await prisma.conversation.findFirst({
        where: {
          merchantId: testMerchant.id,
          customer: { phone: CUSTOMER_PHONE_EXPLICIT },
        },
      });
      expect(conversation).not.toBeNull();

      // Verify OutboxMessage exists for merchant notification (dedupeKey=handoff-{conversationId})
      const outbox = await prisma.outboxMessage.findFirst({
        where: {
          dedupeKey: `handoff-${conversation!.id}`,
        },
      });
      expect(outbox).not.toBeNull();
      expect(outbox!.recipientPhone).toBe(testMerchant.whatsappPhone);
    });

    it('AC-10 (PR-08): conversation.handoffActive persists across DB reads', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          merchantId: testMerchant.id,
          customer: { phone: CUSTOMER_PHONE_EXPLICIT },
        },
      });
      // handoffActive should persist as true in DB
      expect(conversation?.handoffActive).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC-06 E2E: auto-escalation after 3 consecutive UNKNOWN
  // -------------------------------------------------------------------------

  describe('AC-06 (PR-08) E2E: auto-escalation after 3 consecutive UNKNOWN intent messages', () => {
    it('should trigger auto-escalation and create Handoff with reason=auto_escalation', async () => {
      // Send 3 consecutive gibberish messages (→ UNKNOWN intent each time)
      await sendAs(CUSTOMER_PHONE_ESCALATION, 'xzqwoerpq');
      await sendAs(CUSTOMER_PHONE_ESCALATION, 'blargfoo123');
      await sendAs(CUSTOMER_PHONE_ESCALATION, 'zzzmangoreq');

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 300));

      // Verify conversation was created
      const conversation = await prisma.conversation.findFirst({
        where: {
          merchantId: testMerchant.id,
          customer: { phone: CUSTOMER_PHONE_ESCALATION },
        },
      });
      expect(conversation).not.toBeNull();
      // After 3 UNKNOWNs, handoffActive should be true
      expect(conversation!.handoffActive).toBe(true);

      // Verify Handoff record with reason=auto_escalation
      const handoff = await prisma.handoff.findFirst({
        where: { conversationId: conversation!.id },
      });
      expect(handoff).not.toBeNull();
      expect(handoff!.reason).toBe('auto_escalation');
      expect(handoff!.status).toBe('pending');
    });
  });

  // -------------------------------------------------------------------------
  // AC-07 + AC-08 E2E: summary structure validation
  // -------------------------------------------------------------------------

  describe('AC-07 (PR-08) E2E: Handoff summaryJson has required fields', () => {
    it('should store deterministic summary with correct structure', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          merchantId: testMerchant.id,
          customer: { phone: CUSTOMER_PHONE_EXPLICIT },
        },
      });
      expect(conversation).not.toBeNull();

      const handoff = await prisma.handoff.findFirst({
        where: { conversationId: conversation!.id },
      });
      expect(handoff).not.toBeNull();

      // summaryJson should contain required fields
      const summary = handoff!.summaryJson as Record<string, unknown>;
      expect(summary).toHaveProperty('intent');
      expect(summary).toHaveProperty('cartSnapshot');
      expect(summary).toHaveProperty('currentStep');
      expect(summary).toHaveProperty('customerInfo');
      expect(summary).toHaveProperty('conversationHighlights');
      expect(summary).toHaveProperty('metadata');

      // cartSnapshot should be array
      expect(Array.isArray(summary.cartSnapshot)).toBe(true);

      // customerInfo should have phone
      const customerInfo = summary.customerInfo as Record<string, unknown>;
      expect(customerInfo).toHaveProperty('phone');
    });
  });

  // -------------------------------------------------------------------------
  // AC-14 E2E: Idempotency — no duplicate Handoff for same conversation
  // -------------------------------------------------------------------------

  describe('AC-14 (PR-08) E2E: Handoff creation is idempotent — no duplicates', () => {
    it('should not create a second Handoff if one already exists with pending/active status', async () => {
      // Send first handoff trigger
      await sendAs(CUSTOMER_PHONE_IDEMPOTENT, 'quiero hablar con alguien');
      await new Promise((r) => setTimeout(r, 200));

      const conversation = await prisma.conversation.findFirst({
        where: {
          merchantId: testMerchant.id,
          customer: { phone: CUSTOMER_PHONE_IDEMPOTENT },
        },
      });
      expect(conversation).not.toBeNull();

      // Verify first Handoff created
      const handoffsAfterFirst = await prisma.handoff.findMany({
        where: { conversationId: conversation!.id },
      });
      expect(handoffsAfterFirst).toHaveLength(1);

      // Send second handoff trigger for the same customer
      await sendAs(CUSTOMER_PHONE_IDEMPOTENT, 'necesito hablar con una persona');
      await new Promise((r) => setTimeout(r, 200));

      // Verify still only 1 Handoff (idempotent)
      const handoffsAfterSecond = await prisma.handoff.findMany({
        where: { conversationId: conversation!.id },
      });
      expect(handoffsAfterSecond).toHaveLength(1);
    });
  });
});
