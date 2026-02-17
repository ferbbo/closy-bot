import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from './outbox.service';
import { OutboxRepository } from '../repositories/outbox.repository';
import {
  OutboxChannel,
  OutboxMessageType,
  OutboxMessageStatus,
  OutboxMessage,
} from '@prisma/client';

describe('OutboxService', () => {
  let service: OutboxService;
  let repository: jest.Mocked<OutboxRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: OutboxRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
    repository = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueueWhatsAppText', () => {
    it('should enqueue a WhatsApp text message', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Hello, world!',
      };

      const mockMessage = {
        id: 'outbox-1',
        merchantId: 'merchant-1',
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_TEXT,
        to: '+573001234567',
        payloadJson: { text: 'Hello, world!' },
        dedupeKey: expect.any(String),
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

      repository.create.mockResolvedValue(mockMessage);

      const result = await service.enqueueWhatsAppText(params);

      expect(result).toEqual(mockMessage);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: { connect: { id: 'merchant-1' } },
          channel: OutboxChannel.WHATSAPP,
          type: OutboxMessageType.SEND_TEXT,
          to: '+573001234567',
          payloadJson: {
            text: 'Hello, world!',
            replyToMessageId: undefined,
            metadata: undefined,
          },
          dedupeKey: expect.any(String),
        }),
      );
    });

    it('should use custom dedupeKey if provided', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Hello',
        dedupeKey: 'custom-key',
      };

      const mockMessage = {
        id: 'outbox-1',
        dedupeKey: 'custom-key',
      };

      repository.create.mockResolvedValue(mockMessage as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dedupeKey: 'custom-key',
        }),
      );
    });

    it('should include replyToMessageId in payload if provided', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Reply',
        replyToMessageId: 'msg-123',
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadJson: {
            text: 'Reply',
            replyToMessageId: 'msg-123',
            metadata: undefined,
          },
        }),
      );
    });

    it('should include metadata in payload if provided', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Message with metadata',
        metadata: { orderId: '12345' },
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadJson: {
            text: 'Message with metadata',
            replyToMessageId: undefined,
            metadata: { orderId: '12345' },
          },
        }),
      );
    });

    it('should mask phone number in logs', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Test',
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('***4567'));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('+573001234567'));
    });

    it('should truncate text in logs', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      const longText = 'A'.repeat(100);
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: longText,
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('A'.repeat(50) + '...'));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining(longText));
    });
  });
});
