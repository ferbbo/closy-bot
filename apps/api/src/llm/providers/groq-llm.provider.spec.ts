import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GroqLlmProvider } from './groq-llm.provider';
import { LlmProviderError } from '../interfaces/llm-provider.interface';

// Mock the entire groq-sdk module
jest.mock('groq-sdk');

describe('GroqLlmProvider', () => {
  let provider: GroqLlmProvider;
  let configService: ConfigService;
  let mockGroqCreate: jest.Mock;

  beforeEach(async () => {
    // Reset mock before each test
    mockGroqCreate = jest.fn();

    // Mock Groq SDK constructor and methods
    const { default: Groq } = jest.requireMock('groq-sdk');
    Groq.mockImplementation(() => ({
      chat: {
        completions: {
          create: mockGroqCreate,
        },
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroqLlmProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                GROQ_API_KEY: 'test-api-key',
                LLM_MODEL: 'llama-3.1-70b-versatile',
                LLM_MAX_TOKENS: 500,
                LLM_TEMPERATURE: 0.7,
                LLM_TIMEOUT_MS: 30000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<GroqLlmProvider>(GroqLlmProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct config', () => {
      expect(provider).toBeDefined();
      expect(configService.get).toHaveBeenCalledWith('GROQ_API_KEY');
    });

    it('should throw error if API key is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            GroqLlmProvider,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn().mockReturnValue(undefined),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('GROQ_API_KEY is required when LLM_ENABLED=true');
    });
  });

  describe('generateResponse', () => {
    it('should generate response successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: '¡Hola! ¿Cómo puedo ayudarte hoy?' },
            finish_reason: 'stop',
          },
        ],
        model: 'llama-3.1-70b-versatile',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockGroqCreate.mockResolvedValue(mockResponse);

      const result = await provider.generateResponse({
        systemPrompt: 'You are a helpful assistant',
        userMessage: 'Hola',
      });

      expect(result.content).toBe('¡Hola! ¿Cómo puedo ayudarte hoy?');
      expect(result.model).toBe('llama-3.1-70b-versatile');
      expect(result.usage?.totalTokens).toBe(150);
      expect(result.finishReason).toBe('stop');
    });

    it('should include conversation history in request', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'llama-3.1-70b-versatile',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockGroqCreate.mockResolvedValue(mockResponse);

      await provider.generateResponse({
        systemPrompt: 'System prompt',
        userMessage: 'Current message',
        conversationHistory: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
        ],
      });

      const callArgs = mockGroqCreate.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(4); // system + 2 history + current
      expect(callArgs.messages[1].content).toBe('Previous message');
    });

    it('should limit conversation history to last 10 messages', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
        model: 'llama-3.1-70b-versatile',
      };

      mockGroqCreate.mockResolvedValue(mockResponse);

      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
      }));

      await provider.generateResponse({
        systemPrompt: 'System prompt',
        userMessage: 'Current message',
        conversationHistory: longHistory,
      });

      const callArgs = mockGroqCreate.mock.calls[0][0];
      // system + 10 history + current = 12
      expect(callArgs.messages).toHaveLength(12);
    });

    it('should throw error if response is empty', async () => {
      mockGroqCreate.mockResolvedValue({
        choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        model: 'test',
      });

      await expect(
        provider.generateResponse({
          systemPrompt: 'System',
          userMessage: 'User',
        }),
      ).rejects.toThrow('Empty response from Groq API');
    });

    it('should retry on retryable errors', async () => {
      mockGroqCreate.mockRejectedValueOnce(new Error('Rate limit exceeded')).mockResolvedValueOnce({
        choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
        model: 'test',
      });

      const result = await provider.generateResponse({
        systemPrompt: 'System',
        userMessage: 'User',
      });

      expect(result.content).toBe('Success');
      expect(mockGroqCreate).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      mockGroqCreate.mockRejectedValue(new Error('Invalid API key'));

      await expect(
        provider.generateResponse({
          systemPrompt: 'System',
          userMessage: 'User',
        }),
      ).rejects.toThrow(LlmProviderError);

      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
    });

    it('should throw LlmProviderError after max retries', async () => {
      mockGroqCreate.mockRejectedValue(new Error('timeout'));

      await expect(
        provider.generateResponse({
          systemPrompt: 'System',
          userMessage: 'User',
        }),
      ).rejects.toThrow(LlmProviderError);

      expect(mockGroqCreate).toHaveBeenCalledTimes(3);
    });
  });
});
