/**
 * LlmService Unit Tests (PR-11)
 * Tests playbook integration in system prompt composition
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import { GroqLlmProvider } from './providers/groq-llm.provider';
import { PlaybookService } from '../services/playbook.service';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository'; // PR-03.10
import { ConversationRepository } from '../persistence/repositories/conversation.repository'; // PR-03.10

describe('LlmService with Playbooks (PR-11)', () => {
  let service: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        PlaybookService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                LLM_ENABLED: false, // Disable LLM for unit tests
                LLM_PROVIDER: 'groq',
                LLM_MAX_TOKENS: 500,
                LLM_TEMPERATURE: 0.7,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: GroqLlmProvider,
          useValue: {
            generateResponse: jest.fn(),
          },
        },
        {
          provide: MessageLogRepository,
          useValue: {
            findLastKByConversation: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConversationRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildSystemPrompt', () => {
    it('should include ropa playbook prompt', () => {
      const merchant = {
        id: 'test-1',
        name: 'Fashion Store',
        industry: 'ropa' as const,
      };

      const prompt = service.buildSystemPrompt({
        merchantName: merchant.name,
        industry: merchant.industry,
      });

      expect(prompt).toContain('CONTEXTO DE INDUSTRIA');
      expect(prompt).toContain('Ropa y Moda');
      expect(prompt).toContain('talla');
    });

    it('should include belleza playbook prompt with guardrails', () => {
      const merchant = {
        id: 'test-2',
        name: 'Beauty Store',
        industry: 'belleza' as const,
      };

      const prompt = service.buildSystemPrompt({
        merchantName: merchant.name,
        industry: merchant.industry,
      });

      expect(prompt).toContain('Belleza y Cosméticos');
      expect(prompt).toContain('tipo de piel');
      expect(prompt).toContain('NUNCA dar consejos médicos');
    });

    it('should include minimarket playbook prompt', () => {
      const merchant = {
        id: 'test-3',
        name: 'Express Market',
        industry: 'minimarket' as const,
      };

      const prompt = service.buildSystemPrompt({
        merchantName: merchant.name,
        industry: merchant.industry,
      });

      expect(prompt).toContain('Minimarket');
      expect(prompt).toContain('sustituciones');
    });

    it('should work without industry (generic)', () => {
      const prompt = service.buildSystemPrompt({
        merchantName: 'Generic Store',
      });

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should include merchant context', () => {
      const prompt = service.buildSystemPrompt({
        merchantName: 'Test Store',
        industry: 'ropa',
      });

      expect(prompt).toContain('CONTEXTO DEL MERCHANT');
      expect(prompt).toContain('Test Store');
    });

    it('should include cart context when provided', () => {
      const prompt = service.buildSystemPrompt({
        merchantName: 'Test Store',
        industry: 'ropa',
        context: {
          merchantName: 'Test Store',
          currentCart: {
            itemCount: 2,
            total: '$50.00',
            items: ['Camisa M', 'Pantalón L'],
          },
        },
      });

      expect(prompt).toContain('Carrito actual del cliente');
      expect(prompt).toContain('2 items');
      expect(prompt).toContain('$50.00');
    });
  });

  describe('generateConversationalResponse', () => {
    it('should use fallback when LLM disabled', async () => {
      const response = await service.generateConversationalResponse({
        userMessage: 'hola',
        merchantId: 'test-merchant',
      });

      expect(response).toContain('Hola');
      expect(response).toBeDefined();
    });

    it('should handle generic help request with fallback', async () => {
      const response = await service.generateConversationalResponse({
        userMessage: 'ayuda',
        merchantId: 'test-merchant',
      });

      expect(response).toContain('Puedo ayudarte');
      expect(response).toBeDefined();
    });
  });
});
