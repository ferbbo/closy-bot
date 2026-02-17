import { Test, TestingModule } from '@nestjs/testing';
import { MessageDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessageLogRepository, CreateMessageLogDto } from './message-log.repository';

describe('MessageLogRepository (AC-02)', () => {
  let repository: MessageLogRepository;
  let prisma: PrismaService;

  const mockPrismaService = {
    messageLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageLogRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<MessageLogRepository>(MessageLogRepository);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('AC-02: MessageLog registra IN/OUT con expiresAt calculado', () => {
    it('should create message log with IN direction and expiresAt', async () => {
      // Arrange
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const dto: CreateMessageLogDto = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
        direction: MessageDirection.IN,
        providerMessageId: 'wa-msg-456',
        text: 'Hola, quiero comprar zapatos',
        mediaType: null,
        expiresAt,
      };

      const mockCreated = {
        id: 'log-1',
        ...dto,
        createdAt: now,
      };

      mockPrismaService.messageLog.create.mockResolvedValue(mockCreated);

      // Act
      const result = await repository.create(dto);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('log-1');
      expect(result.direction).toBe(MessageDirection.IN);
      expect(result.expiresAt).toEqual(expiresAt);
      expect(result.createdAt).toEqual(now);
      expect(mockPrismaService.messageLog.create).toHaveBeenCalledWith({
        data: dto,
      });
    });

    it('should create message log with OUT direction and expiresAt', async () => {
      // Arrange
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const dto: CreateMessageLogDto = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
        direction: MessageDirection.OUT,
        text: '¡Claro! Tenemos zapatos deportivos y formales.',
        mediaType: null,
        expiresAt,
      };

      const mockCreated = {
        id: 'log-2',
        ...dto,
        providerMessageId: null,
        createdAt: now,
      };

      mockPrismaService.messageLog.create.mockResolvedValue(mockCreated);

      // Act
      const result = await repository.create(dto);

      // Assert
      expect(result.direction).toBe(MessageDirection.OUT);
      expect(result.expiresAt).toEqual(expiresAt);
      expect(result.providerMessageId).toBeUndefined();
    });

    it('should create message log with media type', async () => {
      // Arrange
      const dto: CreateMessageLogDto = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
        direction: MessageDirection.IN,
        providerMessageId: 'wa-media-789',
        text: null,
        mediaType: 'image',
        expiresAt: new Date(),
      };

      const mockCreated = {
        id: 'log-3',
        ...dto,
        createdAt: new Date(),
      };

      mockPrismaService.messageLog.create.mockResolvedValue(mockCreated);

      // Act
      const result = await repository.create(dto);

      // Assert
      expect(result.mediaType).toBe('image');
      expect(result.text).toBeUndefined();
    });
  });

  describe('findLastKByConversation', () => {
    it('should return last K messages ordered by createdAt DESC', async () => {
      // Arrange
      const conversationId = 'conv-123';
      const limit = 10;

      const mockLogs = [
        {
          id: 'log-3',
          conversationId,
          merchantId: 'merchant-1',
          direction: MessageDirection.OUT,
          text: 'Response 2',
          expiresAt: new Date(),
          createdAt: new Date('2026-02-17T14:00:00Z'),
        },
        {
          id: 'log-2',
          conversationId,
          merchantId: 'merchant-1',
          direction: MessageDirection.IN,
          text: 'Message 2',
          expiresAt: new Date(),
          createdAt: new Date('2026-02-17T13:30:00Z'),
        },
      ];

      mockPrismaService.messageLog.findMany.mockResolvedValue(mockLogs);

      // Act
      const result = await repository.findLastKByConversation(conversationId, limit);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('log-3'); // Most recent first
      expect(mockPrismaService.messageLog.findMany).toHaveBeenCalledWith({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired messages', async () => {
      // Arrange
      mockPrismaService.messageLog.deleteMany.mockResolvedValue({ count: 15 });

      // Act
      const result = await repository.deleteExpired();

      // Assert
      expect(result).toBe(15);
      expect(mockPrismaService.messageLog.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('deleteOldestBeyondCap', () => {
    it('should delete messages beyond cap', async () => {
      // Arrange
      const conversationId = 'conv-123';
      const maxMessages = 50;
      const kthNewestDate = new Date('2026-02-01T00:00:00Z');

      mockPrismaService.messageLog.findMany.mockResolvedValue([
        { id: 'log-50', createdAt: kthNewestDate },
      ]);
      mockPrismaService.messageLog.deleteMany.mockResolvedValue({ count: 10 });

      // Act
      const result = await repository.deleteOldestBeyondCap(conversationId, maxMessages);

      // Assert
      expect(result).toBe(10);
      expect(mockPrismaService.messageLog.deleteMany).toHaveBeenCalledWith({
        where: {
          conversationId,
          createdAt: {
            lt: kthNewestDate,
          },
        },
      });
    });

    it('should return 0 if conversation has <= maxMessages', async () => {
      // Arrange
      const conversationId = 'conv-123';
      const maxMessages = 50;

      mockPrismaService.messageLog.findMany.mockResolvedValue([]); // No Kth message

      // Act
      const result = await repository.deleteOldestBeyondCap(conversationId, maxMessages);

      // Assert
      expect(result).toBe(0);
      expect(mockPrismaService.messageLog.deleteMany).not.toHaveBeenCalled();
    });
  });
});
