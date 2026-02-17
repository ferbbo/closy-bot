import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationSummarizationService } from './conversation-summarization.service';
import { ConversationRepository } from '../../persistence/repositories/conversation.repository';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';
import { LlmService } from '../../llm/llm.service';

describe('ConversationSummarizationService (AC-04)', () => {
  let service: ConversationSummarizationService;
  let conversationRepository: ConversationRepository;
  let messageLogRepository: MessageLogRepository;
  let llmService: LlmService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: number) => {
      if (key === 'SUMMARIZATION_BATCH_SIZE') return 20;
      return defaultValue;
    }),
  };

  const mockConversationRepository = {
    findCandidatesForSummarization: jest.fn(),
    updateMemory: jest.fn(),
  };

  const mockMessageLogRepository = {
    findLastKByConversation: jest.fn(),
  };

  const mockLlmService = {
    generateConversationalResponse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationSummarizationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ConversationRepository,
          useValue: mockConversationRepository,
        },
        {
          provide: MessageLogRepository,
          useValue: mockMessageLogRepository,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<ConversationSummarizationService>(ConversationSummarizationService);
    conversationRepository = module.get<ConversationRepository>(ConversationRepository);
    messageLogRepository = module.get<MessageLogRepository>(MessageLogRepository);
    llmService = module.get<LlmService>(LlmService);

    jest.clearAllMocks();
  });

  describe('AC-04: Job de summarization actualiza summary + memoryFacts periódicamente', () => {
    it('should find and summarize conversations', async () => {
      // Arrange
      const mockConversations = [
        { id: 'conv-1', merchantId: 'merchant-1' },
        { id: 'conv-2', merchantId: 'merchant-1' },
      ];

      const mockLogs = [
        {
          id: 'log-1',
          direction: 'IN',
          text: 'Hola, busco una camisa azul',
          createdAt: new Date(),
        },
        {
          id: 'log-2',
          direction: 'OUT',
          text: 'Tenemos estas opciones disponibles...',
          createdAt: new Date(),
        },
      ];

      const mockLlmResponse = `RESUMEN: Cliente busca camisa azul, se presentaron opciones
INTENCION: SEARCH_PRODUCT
FACTS: {"item_buscado":"camisa azul","talla_preferida":"M"}`;

      mockConversationRepository.findCandidatesForSummarization.mockResolvedValue(
        mockConversations,
      );
      mockMessageLogRepository.findLastKByConversation.mockResolvedValue(mockLogs);
      mockLlmService.generateConversationalResponse.mockResolvedValue(mockLlmResponse);

      // Act
      await service.summarizeConversations();

      // Assert
      expect(conversationRepository.findCandidatesForSummarization).toHaveBeenCalledTimes(1);
      expect(messageLogRepository.findLastKByConversation).toHaveBeenCalledTimes(2);
      expect(llmService.generateConversationalResponse).toHaveBeenCalledTimes(2);
      expect(conversationRepository.updateMemory).toHaveBeenCalledTimes(2);

      // Verify summary format
      const updateCall = mockConversationRepository.updateMemory.mock.calls[0];
      expect(updateCall[0]).toBe('conv-1');
      expect(updateCall[1]).toMatchObject({
        summary: expect.stringContaining('Cliente busca camisa azul'),
        lastIntent: 'SEARCH_PRODUCT',
        memoryFacts: { item_buscado: 'camisa azul', talla_preferida: 'M' },
        lastSummarizedAt: expect.any(Date),
      });
    });

    it('should handle conversations with no messages', async () => {
      // Arrange
      const mockConversations = [{ id: 'conv-empty', merchantId: 'merchant-1' }];

      mockConversationRepository.findCandidatesForSummarization.mockResolvedValue(
        mockConversations,
      );
      mockMessageLogRepository.findLastKByConversation.mockResolvedValue([]);

      // Act
      await service.summarizeConversations();

      // Assert
      expect(messageLogRepository.findLastKByConversation).toHaveBeenCalledWith('conv-empty', 20);
      expect(llmService.generateConversationalResponse).not.toHaveBeenCalled();
      expect(conversationRepository.updateMemory).not.toHaveBeenCalled();
    });

    it('should handle LLM errors gracefully', async () => {
      // Arrange
      const mockConversations = [{ id: 'conv-error', merchantId: 'merchant-1' }];
      const mockLogs = [{ id: 'log-1', direction: 'IN', text: 'Test', createdAt: new Date() }];

      mockConversationRepository.findCandidatesForSummarization.mockResolvedValue(
        mockConversations,
      );
      mockMessageLogRepository.findLastKByConversation.mockResolvedValue(mockLogs);
      mockLlmService.generateConversationalResponse.mockRejectedValue(
        new Error('LLM service unavailable'),
      );

      // Act & Assert (should not throw)
      await expect(service.summarizeConversations()).resolves.toBeUndefined();
      expect(conversationRepository.updateMemory).not.toHaveBeenCalled();
    });

    it('should return early when no candidates found', async () => {
      // Arrange
      mockConversationRepository.findCandidatesForSummarization.mockResolvedValue([]);

      // Act
      await service.summarizeConversations();

      // Assert
      expect(conversationRepository.findCandidatesForSummarization).toHaveBeenCalledTimes(1);
      expect(messageLogRepository.findLastKByConversation).not.toHaveBeenCalled();
      expect(llmService.generateConversationalResponse).not.toHaveBeenCalled();
    });

    it('should support manual trigger for summarization', async () => {
      // Arrange
      mockConversationRepository.findCandidatesForSummarization.mockResolvedValue([]);

      // Act
      const result = await service.triggerSummarization();

      // Assert
      expect(result).toEqual({ summarizedCount: 0 });
      expect(conversationRepository.findCandidatesForSummarization).toHaveBeenCalledTimes(1);
    });
  });
});
