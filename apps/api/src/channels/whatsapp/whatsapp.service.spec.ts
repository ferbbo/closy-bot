import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WhatsAppService } from './whatsapp.service';
import { MessageRepository } from '../../persistence/repositories/message.repository';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let messageRepository: jest.Mocked<MessageRepository>;

  const mockInboundMessage = {
    id: 'test-id-123',
    messageId: 'wamid.123456',
    from: '1234567890',
    timestamp: new Date('2026-02-11T10:00:00Z'),
    text: 'Hello world',
    mediaType: null,
    mediaUrl: null,
    processed: false,
    createdAt: new Date('2026-02-11T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findByMessageId: jest.fn(),
      markAsProcessed: jest.fn(),
      findBySender: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        {
          provide: MessageRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
    messageRepository = module.get(MessageRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processInboundMessage', () => {
    const validDto = {
      message_id: 'wamid.123456',
      from: '1234567890',
      timestamp: '2026-02-11T10:00:00Z',
      text: 'Hello world',
    };

    it('should successfully process a new message', async () => {
      messageRepository.create.mockResolvedValue(mockInboundMessage);

      const result = await service.processInboundMessage(validDto);

      expect(result).toEqual({
        messageId: 'wamid.123456',
        channel: 'whatsapp',
        userExternalId: '1234567890',
        timestamp: mockInboundMessage.timestamp,
        text: 'Hello world',
      });

      expect(messageRepository.create).toHaveBeenCalledWith({
        messageId: 'wamid.123456',
        from: '1234567890',
        timestamp: new Date('2026-02-11T10:00:00Z'),
        text: 'Hello world',
        mediaType: undefined,
        mediaUrl: undefined,
        processed: false,
      });
    });

    it('should throw ConflictException on duplicate message_id', async () => {
      // Simulate Prisma unique constraint violation (P2002)
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      messageRepository.create.mockRejectedValue(prismaError);

      await expect(service.processInboundMessage(validDto)).rejects.toThrow(ConflictException);
    });

    it('should handle message with media attachment', async () => {
      const dtoWithMedia = {
        ...validDto,
        media_type: 'image',
        media_url: 'https://example.com/image.jpg',
      };

      const messageWithMedia = {
        ...mockInboundMessage,
        mediaType: 'image',
        mediaUrl: 'https://example.com/image.jpg',
      };

      messageRepository.create.mockResolvedValue(messageWithMedia);

      const result = await service.processInboundMessage(dtoWithMedia);

      expect(result.attachments).toEqual([
        {
          type: 'image',
          url: 'https://example.com/image.jpg',
        },
      ]);
    });

    it('should re-throw non-Prisma errors', async () => {
      const genericError = new Error('Database connection failed');
      messageRepository.create.mockRejectedValue(genericError);

      await expect(service.processInboundMessage(validDto)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should mask phone numbers in logs', async () => {
      messageRepository.create.mockResolvedValue(mockInboundMessage);
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.processInboundMessage(validDto);

      // Verify logger was called with masked phone (****7890)
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('****7890'),
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('1234567890'),
      );

      loggerSpy.mockRestore();
    });
  });
});
