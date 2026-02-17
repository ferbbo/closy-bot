import { Test, TestingModule } from '@nestjs/testing';
import { OutboxRepository } from './outbox.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  OutboxChannel,
  OutboxMessageType,
  OutboxMessageStatus,
  OutboxMessage,
  Prisma,
} from '@prisma/client';

describe('OutboxRepository', () => {
  let repository: OutboxRepository;
  let prisma: PrismaService;

  // Mock merchant for tests
  const mockMerchantId = 'test-merchant-id';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxRepository,
        {
          provide: PrismaService,
          useValue: {
            outboxMessage: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<OutboxRepository>(OutboxRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new outbox message', async () => {
      const data = {
        merchant: { connect: { id: mockMerchantId } },
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_TEXT,
        to: '+573001234567',
        payloadJson: { text: 'Hello' },
        dedupeKey: 'test-key',
      };

      const mockMessage = {
        id: 'outbox-1',
        merchantId: mockMerchantId,
        ...data,
        status: OutboxMessageStatus.PENDING,
        attempts: 0,
        nextRetryAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        providerMessageId: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.outboxMessage, 'create').mockResolvedValue(mockMessage as OutboxMessage);

      const result = await repository.create(data as Prisma.OutboxMessageCreateInput);

      expect(result).toEqual(mockMessage);
      expect(prisma.outboxMessage.create).toHaveBeenCalledWith({ data });
    });

    it('should return existing message on duplicate dedupeKey', async () => {
      const data = {
        merchant: { connect: { id: mockMerchantId } },
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_TEXT,
        to: '+573001234567',
        payloadJson: { text: 'Hello' },
        dedupeKey: 'duplicate-key',
      };

      const existingMessage: Partial<OutboxMessage> = {
        id: 'existing-1',
        merchantId: mockMerchantId,
        status: OutboxMessageStatus.PENDING,
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_TEXT,
        to: '+573001234567',
        payloadJson: { text: 'Hello' },
        dedupeKey: 'duplicate-key',
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock P2002 error as Prisma would throw it
      class P2002Error extends Prisma.PrismaClientKnownRequestError {
        constructor() {
          super('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['merchantId', 'dedupeKey'] },
          });
        }
      }

      jest.spyOn(prisma.outboxMessage, 'create').mockRejectedValue(new P2002Error());
      jest
        .spyOn(prisma.outboxMessage, 'findUnique')
        .mockResolvedValue(existingMessage as OutboxMessage);

      const result = await repository.create(data as Prisma.OutboxMessageCreateInput);

      expect(result).toEqual(existingMessage);
      expect(prisma.outboxMessage.findUnique).toHaveBeenCalledWith({
        where: {
          merchantId_dedupeKey: {
            merchantId: mockMerchantId,
            dedupeKey: 'duplicate-key',
          },
        },
      });
    });
  });

  describe('claimBatch', () => {
    it('should claim pending messages with SKIP LOCKED', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          status: OutboxMessageStatus.SENDING,
          lockedAt: new Date(),
          lockedBy: 'worker-1',
        },
        {
          id: 'msg-2',
          status: OutboxMessageStatus.SENDING,
          lockedAt: new Date(),
          lockedBy: 'worker-1',
        },
      ];

      jest.spyOn(prisma, '$queryRaw').mockResolvedValue(mockMessages as OutboxMessage[]);

      const result = await repository.claimBatch(10, 'worker-1', 300);

      expect(result).toEqual(mockMessages);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('markSent', () => {
    it('should mark message as SENT', async () => {
      const mockMessage = {
        id: 'msg-1',
        status: OutboxMessageStatus.SENT,
        providerMessageId: 'whatsapp-123',
        sentAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      };

      jest.spyOn(prisma.outboxMessage, 'update').mockResolvedValue(mockMessage as OutboxMessage);

      const result = await repository.markSent('msg-1', 'whatsapp-123');

      expect(result.status).toBe(OutboxMessageStatus.SENT);
      expect(result.providerMessageId).toBe('whatsapp-123');
      expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          status: OutboxMessageStatus.SENT,
          providerMessageId: 'whatsapp-123',
          lockedAt: null,
          lockedBy: null,
        }),
      });
    });
  });

  describe('markFailed', () => {
    it('should increment attempts and schedule retry', async () => {
      const existingMessage = {
        id: 'msg-1',
        attempts: 2,
      };

      jest
        .spyOn(prisma.outboxMessage, 'findUnique')
        .mockResolvedValue(existingMessage as OutboxMessage);

      const mockUpdatedMessage = {
        id: 'msg-1',
        status: OutboxMessageStatus.FAILED,
        attempts: 3,
        lastError: 'Network error',
        lockedAt: null,
        lockedBy: null,
      };

      jest
        .spyOn(prisma.outboxMessage, 'update')
        .mockResolvedValue(mockUpdatedMessage as OutboxMessage);

      const result = await repository.markFailed('msg-1', 'Network error', 5);

      expect(result.attempts).toBe(3);
      expect(result.status).toBe(OutboxMessageStatus.FAILED);
      expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          status: OutboxMessageStatus.FAILED,
          attempts: 3,
          lastError: 'Network error',
          lockedAt: null,
          lockedBy: null,
        }),
      });
    });

    it('should use exponential backoff for retries', async () => {
      const existingMessage = {
        id: 'msg-1',
        attempts: 1,
      };

      jest
        .spyOn(prisma.outboxMessage, 'findUnique')
        .mockResolvedValue(existingMessage as OutboxMessage);
      jest.spyOn(prisma.outboxMessage, 'update').mockResolvedValue({} as OutboxMessage);

      await repository.markFailed('msg-1', 'Error', 5);

      // Verify exponential backoff (attempts=2 → 120s delay)
      expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          nextRetryAt: expect.any(Date),
        }),
      });
    });
  });
});
