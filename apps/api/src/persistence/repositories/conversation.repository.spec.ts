import { Test, TestingModule } from '@nestjs/testing';
import { ConversationRepository } from './conversation.repository';
import { PrismaService } from '../prisma/prisma.service';
import { Conversation } from '@prisma/client';

describe('ConversationRepository', () => {
  let repository: ConversationRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockConversation: Conversation = {
    id: 'conv_123',
    customerId: 'cust_123',
    merchantId: 'merch_123',
    channel: 'whatsapp',
    status: 'active',
    lastMessageAt: new Date('2026-02-12T10:00:00Z'),
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrisma = {
      conversation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<ConversationRepository>(ConversationRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new conversation', async () => {
      prisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await repository.create({
        customer: { connect: { id: 'cust_123' } },
        merchant: { connect: { id: 'merch_123' } },
        channel: 'whatsapp',
        status: 'active',
      });

      expect(result).toEqual(mockConversation);
    });
  });

  describe('findById', () => {
    it('should find conversation by ID', async () => {
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await repository.findById('conv_123');

      expect(result).toEqual(mockConversation);
      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv_123' },
      });
    });
  });

  describe('findByCustomerAndChannel', () => {
    it('should find active conversation by customer, merchant and channel', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await repository.findByCustomerAndChannel('cust_123', 'merch_123', 'whatsapp');

      expect(result).toEqual(mockConversation);
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          customerId: 'cust_123',
          merchantId: 'merch_123',
          channel: 'whatsapp',
          status: 'active',
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
      });
    });

    it('should return null if no active conversation found', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      const result = await repository.findByCustomerAndChannel('cust_999', 'merch_999', 'whatsapp');

      expect(result).toBeNull();
    });
  });

  describe('findByCustomerId', () => {
    it('should find all conversations for a customer', async () => {
      const conversations = [mockConversation];
      prisma.conversation.findMany.mockResolvedValue(conversations);

      const result = await repository.findByCustomerId('cust_123');

      expect(result).toEqual(conversations);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith({
        where: { customerId: 'cust_123' },
        orderBy: { lastMessageAt: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('should update conversation data', async () => {
      const updatedConversation = { ...mockConversation, status: 'closed' };
      prisma.conversation.update.mockResolvedValue(updatedConversation);

      const result = await repository.update('conv_123', { status: 'closed' });

      expect(result).toEqual(updatedConversation);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv_123' },
        data: { status: 'closed' },
      });
    });
  });

  describe('updateLastMessageAt', () => {
    it('should update last message timestamp', async () => {
      const timestamp = new Date('2026-02-12T11:00:00Z');
      const updatedConversation = {
        ...mockConversation,
        lastMessageAt: timestamp,
      };
      prisma.conversation.update.mockResolvedValue(updatedConversation);

      const result = await repository.updateLastMessageAt('conv_123', timestamp);

      expect(result).toEqual(updatedConversation);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv_123' },
        data: { lastMessageAt: timestamp },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update conversation status with valid value', async () => {
      const updatedConversation = { ...mockConversation, status: 'handoff' };
      prisma.conversation.update.mockResolvedValue(updatedConversation);

      const result = await repository.updateStatus('conv_123', 'handoff');

      expect(result).toEqual(updatedConversation);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv_123' },
        data: { status: 'handoff' },
      });
    });

    it('should reject invalid conversation status', async () => {
      await expect(repository.updateStatus('conv_123', 'invalid_status')).rejects.toThrow(
        'Invalid conversation status: invalid_status. Must be one of: active, closed, handoff',
      );

      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('should accept all valid status values', async () => {
      const validStatuses = ['active', 'closed', 'handoff'];

      for (const status of validStatuses) {
        const updatedConversation = { ...mockConversation, status };
        prisma.conversation.update.mockResolvedValue(updatedConversation);

        await repository.updateStatus('conv_123', status);

        expect(prisma.conversation.update).toHaveBeenCalledWith({
          where: { id: 'conv_123' },
          data: { status },
        });
      }
    });
  });
});
