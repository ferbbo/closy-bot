import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessageLogCleanupService } from './message-log-cleanup.service';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';

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
  });
});
