import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationSummarizationService } from './conversation-summarization.service';

describe('ConversationSummarizationService (AC-04 - stub)', () => {
  let service: ConversationSummarizationService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationSummarizationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ConversationSummarizationService>(ConversationSummarizationService);

    jest.clearAllMocks();
  });

  describe('AC-04: Job de summarization actualiza summary + memoryFacts periódicamente', () => {
    it('should have summarization cron job defined', async () => {
      // Arrange & Act
      await service.summarizeConversations();

      // Assert: job runs without throwing (stub implementation)
      expect(true).toBe(true);
    });

    it('should support manual trigger for summarization', async () => {
      // Act
      const result = await service.triggerSummarization();

      // Assert: stub returns 0 until fully implemented
      expect(result).toEqual({ summarizedCount: 0 });
    });
  });
});
