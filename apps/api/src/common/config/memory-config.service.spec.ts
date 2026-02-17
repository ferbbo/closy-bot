import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MemoryConfigService } from './memory-config.service';

describe('MemoryConfigService (AC-06)', () => {
  let service: MemoryConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: number) => {
      const config: Record<string, number> = {
        MESSAGE_HISTORY_DAYS: 30,
        MESSAGE_HISTORY_MAX_PER_CONVO: 50,
        LLM_CONTEXT_LAST_K: 10,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MemoryConfigService>(MemoryConfigService);

    jest.clearAllMocks();
  });

  describe('AC-06: Config retención con defaults + override merchant', () => {
    it('should return default MESSAGE_HISTORY_DAYS when no override', () => {
      const result = service.getMessageHistoryDays();
      expect(result).toBe(30);
    });

    it('should return override MESSAGE_HISTORY_DAYS from playbookConfig', () => {
      const playbookConfig = {
        memory: {
          messageHistoryDays: 60,
        },
      };

      const result = service.getMessageHistoryDays(playbookConfig);
      expect(result).toBe(60);
    });

    it('should return default MESSAGE_HISTORY_MAX_PER_CONVO when no override', () => {
      const result = service.getMessageHistoryMaxPerConvo();
      expect(result).toBe(50);
    });

    it('should return override MESSAGE_HISTORY_MAX_PER_CONVO from playbookConfig', () => {
      const playbookConfig = {
        memory: {
          messageHistoryMaxPerConvo: 100,
        },
      };

      const result = service.getMessageHistoryMaxPerConvo(playbookConfig);
      expect(result).toBe(100);
    });

    it('should return default LLM_CONTEXT_LAST_K when no override', () => {
      const result = service.getLlmContextLastK();
      expect(result).toBe(10);
    });

    it('should return override LLM_CONTEXT_LAST_K from playbookConfig', () => {
      const playbookConfig = {
        memory: {
          llmContextLastK: 20,
        },
      };

      const result = service.getLlmContextLastK(playbookConfig);
      expect(result).toBe(20);
    });

    it('should handle missing memory key in playbookConfig', () => {
      const playbookConfig = {
        other: 'config',
      };

      expect(service.getMessageHistoryDays(playbookConfig)).toBe(30);
      expect(service.getMessageHistoryMaxPerConvo(playbookConfig)).toBe(50);
      expect(service.getLlmContextLastK(playbookConfig)).toBe(10);
    });

    it('should handle invalid playbookConfig types', () => {
      expect(service.getMessageHistoryDays(null)).toBe(30);
      expect(service.getMessageHistoryDays(undefined)).toBe(30);
      expect(service.getMessageHistoryDays('invalid')).toBe(30);
      expect(service.getMessageHistoryDays(123)).toBe(30);
    });

    it('should ignore invalid override values', () => {
      const playbookConfig = {
        memory: {
          messageHistoryDays: 'invalid',
          messageHistoryMaxPerConvo: null,
          llmContextLastK: {},
        },
      };

      expect(service.getMessageHistoryDays(playbookConfig)).toBe(30);
      expect(service.getMessageHistoryMaxPerConvo(playbookConfig)).toBe(50);
      expect(service.getLlmContextLastK(playbookConfig)).toBe(10);
    });

    it('should support partial overrides', () => {
      const playbookConfig = {
        memory: {
          messageHistoryDays: 45,
          // Other fields use defaults
        },
      };

      expect(service.getMessageHistoryDays(playbookConfig)).toBe(45);
      expect(service.getMessageHistoryMaxPerConvo(playbookConfig)).toBe(50);
      expect(service.getLlmContextLastK(playbookConfig)).toBe(10);
    });
  });
});
