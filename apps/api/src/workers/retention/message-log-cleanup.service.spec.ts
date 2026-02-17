import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessageLogCleanupService } from './message-log-cleanup.service';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';
import { MemoryConfigService } from '../../common/config/memory-config.service'; // PR-03.10 AC-06

describe('MessageLogCleanupService (AC-03)', () => {
  let service: MessageLogCleanupService;
  let messageLogRepository: MessageLogRepository;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: number) => {
      if (key === 'MESSAGE_HISTORY_MAX_PER_CONVO') return 50;
      return defaultValue;
    }),
  };

  const mockMessageLogRepository = {
    deleteExpired: jest.fn(),
    findConversationsExceedingCap: jest.fn(),
    deleteOldestBeyondCap: jest.fn(),
  };

  const mockMemoryConfigService = {
    getMessageHistoryMaxPerConvo: jest.fn().mockReturnValue(50),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageLogCleanupService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MessageLogRepository,
          useValue: mockMessageLogRepository,
        },
        {
          provide: MemoryConfigService,
          useValue: mockMemoryConfigService,
        },
      ],
    }).compile();

    service = module.get<MessageLogCleanupService>(MessageLogCleanupService);
    messageLogRepository = module.get<MessageLogRepository>(MessageLogRepository);

    jest.clearAllMocks();
  });

  describe('AC-03: Job de cleanup elimina logs expirados + aplica cap por conversación', () => {
    it('should delete expired message logs', async () => {
      // Arrange
      mockMessageLogRepository.deleteExpired.mockResolvedValue(25);

      // Act
      await service.cleanupExpiredMessages();

      // Assert
      expect(messageLogRepository.deleteExpired).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      const error = new Error('Database connection lost');
      mockMessageLogRepository.deleteExpired.mockRejectedValue(error);

      // Act & Assert (should not throw)
      await expect(service.cleanupExpiredMessages()).resolves.toBeUndefined();
      expect(messageLogRepository.deleteExpired).toHaveBeenCalledTimes(1);
    });

    it('should support manual trigger for cleanup', async () => {
      // Arrange
      mockMessageLogRepository.deleteExpired.mockResolvedValue(10);

      // Act
      const result = await service.triggerCleanup();

      // Assert
      expect(result).toEqual({ deletedCount: 10 });
      expect(messageLogRepository.deleteExpired).toHaveBeenCalledTimes(1);
    });

    it('should apply cap cleanup for conversations exceeding limit', async () => {
      // Arrange
      mockMessageLogRepository.deleteExpired.mockResolvedValue(5);
      mockMessageLogRepository.findConversationsExceedingCap.mockResolvedValue([
        { conversationId: 'conv-1', _count: { id: 60 } },
        { conversationId: 'conv-2', _count: { id: 75 } },
      ]);
      mockMessageLogRepository.deleteOldestBeyondCap.mockResolvedValueOnce(10); // conv-1
      mockMessageLogRepository.deleteOldestBeyondCap.mockResolvedValueOnce(25); // conv-2

      // Act
      await service.cleanupExpiredMessages();

      // Assert
      expect(messageLogRepository.deleteExpired).toHaveBeenCalledTimes(1);
      expect(messageLogRepository.findConversationsExceedingCap).toHaveBeenCalledWith(50);
      expect(messageLogRepository.deleteOldestBeyondCap).toHaveBeenCalledTimes(2);
      expect(messageLogRepository.deleteOldestBeyondCap).toHaveBeenCalledWith('conv-1', 50);
      expect(messageLogRepository.deleteOldestBeyondCap).toHaveBeenCalledWith('conv-2', 50);
    });

    it('should not call cap cleanup when no conversations exceed limit', async () => {
      // Arrange
      mockMessageLogRepository.deleteExpired.mockResolvedValue(5);
      mockMessageLogRepository.findConversationsExceedingCap.mockResolvedValue([]);

      // Act
      await service.cleanupExpiredMessages();

      // Assert
      expect(messageLogRepository.deleteExpired).toHaveBeenCalledTimes(1);
      expect(messageLogRepository.findConversationsExceedingCap).toHaveBeenCalledWith(50);
      expect(messageLogRepository.deleteOldestBeyondCap).not.toHaveBeenCalled();
    });
  });
});
