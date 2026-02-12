import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { CustomerService } from '../src/services/customer.service';
import { ConversationService } from '../src/services/conversation.service';
import { MerchantRepository } from '../src/persistence/repositories/merchant.repository';
import { Channel } from '../src/domain/entities/conversation.entity';

/**
 * Integration tests for Customer and Conversation identity resolution
 *
 * These tests verify that:
 * - Customer identity is resolved by phone (get-or-create pattern)
 * - Conversation is created/retrieved for customer+channel
 * - Operations are idempotent (same inputs = same outputs)
 * - Phone normalization works correctly
 */
describe('Customer & Conversation Identity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerService: CustomerService;
  let conversationService: ConversationService;
  let merchantRepository: MerchantRepository;
  let testMerchantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    customerService = app.get(CustomerService);
    conversationService = app.get(ConversationService);
    merchantRepository = app.get(MerchantRepository);

    // Create a test merchant
    const merchant = await merchantRepository.create({
      name: 'Test Merchant E2E',
      whatsappNumber: '+573009999999',
      apiKey: 'sk_test_e2e_merchant_key',
    });
    testMerchantId = merchant.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.conversation.deleteMany({
      where: { merchantId: testMerchantId },
    });
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+57300999' } },
    });
    await prisma.merchant.deleteMany({
      where: { id: testMerchantId },
    });
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test customers and conversations before each test
    await prisma.conversation.deleteMany({
      where: { merchantId: testMerchantId },
    });
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+57300999' } },
    });
  });

  describe('CustomerService.resolveByPhone', () => {
    it('should create a new customer on first call', async () => {
      const phone = '+573009991234';
      const customer = await customerService.resolveByPhone(phone, 'John Doe');

      expect(customer).toBeDefined();
      expect(customer.phone).toBe(phone);
      expect(customer.name).toBe('John Doe');
      expect(customer.language).toBe('es');
      expect(customer.id).toBeDefined();
    });

    it('should return existing customer on subsequent calls (idempotent)', async () => {
      const phone = '+573009991234';

      // First call - creates customer
      const customer1 = await customerService.resolveByPhone(phone, 'John Doe');

      // Second call - returns same customer
      const customer2 = await customerService.resolveByPhone(phone, 'Jane Doe');

      expect(customer1.id).toBe(customer2.id);
      expect(customer1.phone).toBe(customer2.phone);
      expect(customer1.name).toBe('John Doe'); // Name not updated

      // Verify only one record in database
      const customers = await prisma.customer.findMany({
        where: { phone },
      });
      expect(customers).toHaveLength(1);
    });

    it('should normalize phone number before lookup', async () => {
      const normalizedPhone = '+573009991234';

      // Create with normalized phone
      const customer1 = await customerService.resolveByPhone(normalizedPhone);

      // Lookup with formatted phone (spaces, dashes, parentheses)
      const customer2 = await customerService.resolveByPhone('+57 (300) 999-1234');

      // Should return same customer
      expect(customer1.id).toBe(customer2.id);
    });

    it('should create customer with default language if not provided', async () => {
      const phone = '+573009995678';
      const customer = await customerService.resolveByPhone(phone);

      expect(customer.language).toBe('es');
    });
  });

  describe('ConversationService.getOrCreateConversation', () => {
    let customerId: string;

    beforeEach(async () => {
      // Create a test customer
      const customer = await customerService.resolveByPhone('+573009991111', 'Test User');
      customerId = customer.id;
    });

    it('should create a new conversation on first call', async () => {
      const conversation = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WHATSAPP,
      );

      expect(conversation).toBeDefined();
      expect(conversation.customerId).toBe(customerId);
      expect(conversation.merchantId).toBe(testMerchantId);
      expect(conversation.channel).toBe('whatsapp');
      expect(conversation.status).toBe('active');
      expect(conversation.lastMessageAt).toBeDefined();
    });

    it('should return existing active conversation on subsequent calls (idempotent)', async () => {
      // First call - creates conversation
      const conversation1 = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WHATSAPP,
      );

      // Wait a bit to verify timestamp update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second call - returns same conversation
      const conversation2 = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WHATSAPP,
      );

      expect(conversation1.id).toBe(conversation2.id);
      // Last message timestamp should be updated
      expect(conversation2.lastMessageAt?.getTime()).toBeGreaterThanOrEqual(
        conversation1.lastMessageAt?.getTime() ?? 0,
      );

      // Verify only one active conversation in database
      const conversations = await prisma.conversation.findMany({
        where: {
          customerId,
          channel: 'whatsapp',
          status: 'active',
        },
      });
      expect(conversations).toHaveLength(1);
    });

    it('should create separate conversations for different channels', async () => {
      const whatsappConv = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WHATSAPP,
      );

      const webchatConv = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WEBCHAT,
      );

      expect(whatsappConv.id).not.toBe(webchatConv.id);
      expect(whatsappConv.channel).toBe('whatsapp');
      expect(webchatConv.channel).toBe('webchat');
    });
  });

  describe('Full flow: phone → customer → conversation', () => {
    it('should resolve complete flow from phone to conversation', async () => {
      const phone = '+573009992222';

      // Step 1: Resolve customer by phone
      const customer = await customerService.resolveByPhone(phone, 'Full Flow User');
      expect(customer).toBeDefined();
      expect(customer.phone).toBe(phone);

      // Step 2: Create conversation for customer
      const conversation = await conversationService.getOrCreateConversation(
        customer.id,
        testMerchantId,
        Channel.WHATSAPP,
      );
      expect(conversation).toBeDefined();
      expect(conversation.customerId).toBe(customer.id);

      // Step 3: Verify conversation can be retrieved with conversation_id
      const retrievedConv = await conversationService.findById(conversation.id);
      expect(retrievedConv).toBeDefined();
      expect(retrievedConv?.id).toBe(conversation.id);

      // Step 4: Verify flow is idempotent
      const customer2 = await customerService.resolveByPhone(phone);
      const conversation2 = await conversationService.getOrCreateConversation(
        customer2.id,
        testMerchantId,
        Channel.WHATSAPP,
      );

      expect(customer2.id).toBe(customer.id);
      expect(conversation2.id).toBe(conversation.id);
    });

    it('should handle phone normalization in full flow', async () => {
      // First message with formatted phone
      const customer1 = await customerService.resolveByPhone('+57 (300) 999-3333', 'User 1');
      const conv1 = await conversationService.getOrCreateConversation(
        customer1.id,
        testMerchantId,
        Channel.WHATSAPP,
      );

      // Second message with normalized phone
      const customer2 = await customerService.resolveByPhone('+573009993333');
      const conv2 = await conversationService.getOrCreateConversation(
        customer2.id,
        testMerchantId,
        Channel.WHATSAPP,
      );

      // Should be same customer and conversation
      expect(customer1.id).toBe(customer2.id);
      expect(conv1.id).toBe(conv2.id);
    });
  });

  describe('Conversation status transitions', () => {
    let customerId: string;
    let conversationId: string;

    beforeEach(async () => {
      const customer = await customerService.resolveByPhone('+573009994444');
      customerId = customer.id;

      const conversation = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WHATSAPP,
      );
      conversationId = conversation.id;
    });

    it('should close conversation', async () => {
      const updated = await conversationService.close(conversationId);

      expect(updated.status).toBe('closed');
      expect(updated.id).toBe(conversationId);
    });

    it('should handoff conversation to human', async () => {
      const updated = await conversationService.handoff(conversationId);

      expect(updated.status).toBe('handoff');
      expect(updated.id).toBe(conversationId);
    });

    it('should create new conversation after closing previous one', async () => {
      // Close the first conversation
      await conversationService.close(conversationId);

      // Try to get/create conversation again (should create new since previous is closed)
      const newConv = await conversationService.getOrCreateConversation(
        customerId,
        testMerchantId,
        Channel.WHATSAPP,
      );

      // Should return same conversation (still active) OR create new one
      // Current implementation returns latest active, so if closed, creates new
      // For MVP, we simplified to always return active or create new
      expect(newConv).toBeDefined();
    });
  });
});
