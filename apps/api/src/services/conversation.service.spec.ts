import { Test, TestingModule } from '@nestjs/testing';
import { ConversationService } from './conversation.service';
import { ConversationRepository } from '../persistence/repositories/conversation.repository';
import { Conversation } from '@prisma/client';
import { Channel, ConversationStatus } from '../domain/entities/conversation.entity';

describe('ConversationService', () => {
  let service: ConversationService;
  let repository: jest.Mocked<ConversationRepository>;

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
    const mockRepository = {
      findByCustomerAndChannel: jest.fn(),
      findById: jest.fn(),
      findByCustomerId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      updateLastMessageAt: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: ConversationRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    repository = module.get(ConversationRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateConversation', () => {
    it('should return existing active conversation and update timestamp', async () => {
      const updatedConversation = {
        ...mockConversation,
        lastMessageAt: new Date('2026-02-12T11:00:00Z'),
      };
      repository.findByCustomerAndChannel.mockResolvedValue(mockConversation);
      repository.updateLastMessageAt.mockResolvedValue(updatedConversation);

      const result = await service.getOrCreateConversation(
        'cust_123',
        'merch_123',
        Channel.WHATSAPP,
      );

      expect(result).toEqual(updatedConversation);
      expect(repository.findByCustomerAndChannel).toHaveBeenCalledWith(
        'cust_123',
        'merch_123',
        'whatsapp',
      );
      expect(repository.updateLastMessageAt).toHaveBeenCalledWith('conv_123', expect.any(Date));
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should create new conversation if none exists', async () => {
      repository.findByCustomerAndChannel.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockConversation);

      const result = await service.getOrCreateConversation(
        'cust_123',
        'merch_123',
        Channel.WHATSAPP,
      );

      expect(result).toEqual(mockConversation);
      expect(repository.findByCustomerAndChannel).toHaveBeenCalledWith(
        'cust_123',
        'merch_123',
        'whatsapp',
      );
      expect(repository.create).toHaveBeenCalledWith({
        customer: { connect: { id: 'cust_123' } },
        merchant: { connect: { id: 'merch_123' } },
        channel: 'whatsapp',
        status: ConversationStatus.ACTIVE,
        lastMessageAt: expect.any(Date),
      });
    });

    it('should be idempotent for same customer and channel', async () => {
      repository.findByCustomerAndChannel.mockResolvedValue(mockConversation);
      repository.updateLastMessageAt.mockResolvedValue(mockConversation);

      const result1 = await service.getOrCreateConversation(
        'cust_123',
        'merch_123',
        Channel.WHATSAPP,
      );
      const result2 = await service.getOrCreateConversation(
        'cust_123',
        'merch_123',
        Channel.WHATSAPP,
      );

      expect(result1).toEqual(result2);
      expect(repository.findByCustomerAndChannel).toHaveBeenCalledTimes(2);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should return updated conversation object after timestamp update', async () => {
      const oldTimestamp = new Date('2026-02-12T10:00:00Z');
      const newTimestamp = new Date('2026-02-12T11:00:00Z');
      const oldConversation = { ...mockConversation, lastMessageAt: oldTimestamp };
      const updatedConversation = { ...mockConversation, lastMessageAt: newTimestamp };

      repository.findByCustomerAndChannel.mockResolvedValue(oldConversation);
      repository.updateLastMessageAt.mockResolvedValue(updatedConversation);

      const result = await service.getOrCreateConversation(
        'cust_123',
        'merch_123',
        Channel.WHATSAPP,
      );

      expect(result.lastMessageAt).toEqual(newTimestamp);
      expect(result.lastMessageAt).not.toEqual(oldTimestamp);
    });
  });

  describe('findById', () => {
    it('should find conversation by ID', async () => {
      repository.findById.mockResolvedValue(mockConversation);

      const result = await service.findById('conv_123');

      expect(result).toEqual(mockConversation);
      expect(repository.findById).toHaveBeenCalledWith('conv_123');
    });
  });

  describe('updateStatus', () => {
    it('should update conversation status', async () => {
      const updatedConversation = { ...mockConversation, status: 'closed' };
      repository.updateStatus.mockResolvedValue(updatedConversation);

      const result = await service.updateStatus('conv_123', ConversationStatus.CLOSED);

      expect(result).toEqual(updatedConversation);
      expect(repository.updateStatus).toHaveBeenCalledWith('conv_123', 'closed');
    });
  });

  describe('close', () => {
    it('should close conversation', async () => {
      const closedConversation = { ...mockConversation, status: 'closed' };
      repository.updateStatus.mockResolvedValue(closedConversation);

      const result = await service.close('conv_123');

      expect(result).toEqual(closedConversation);
      expect(repository.updateStatus).toHaveBeenCalledWith('conv_123', 'closed');
    });
  });

  describe('handoff', () => {
    it('should handoff conversation to human', async () => {
      const handoffConversation = { ...mockConversation, status: 'handoff' };
      repository.updateStatus.mockResolvedValue(handoffConversation);

      const result = await service.handoff('conv_123');

      expect(result).toEqual(handoffConversation);
      expect(repository.updateStatus).toHaveBeenCalledWith('conv_123', 'handoff');
    });
  });

  describe('findByCustomerId', () => {
    it('should find all conversations for a customer', async () => {
      const conversations = [mockConversation];
      repository.findByCustomerId.mockResolvedValue(conversations);

      const result = await service.findByCustomerId('cust_123');

      expect(result).toEqual(conversations);
      expect(repository.findByCustomerId).toHaveBeenCalledWith('cust_123');
    });
  });

  describe('updateLastMessageAt', () => {
    it('should update last message timestamp', async () => {
      const timestamp = new Date('2026-02-12T11:00:00Z');
      const updatedConversation = {
        ...mockConversation,
        lastMessageAt: timestamp,
      };
      repository.updateLastMessageAt.mockResolvedValue(updatedConversation);

      const result = await service.updateLastMessageAt('conv_123', timestamp);

      expect(result).toEqual(updatedConversation);
      expect(repository.updateLastMessageAt).toHaveBeenCalledWith('conv_123', timestamp);
    });
  });
});
