import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RouteDecisionService } from './route-decision.service';
import { IntentRouterService } from './intent/intent-router.service';
import { LlmService } from '../llm/llm.service';
import type { RouteContext } from './types/route.types';

/**
 * PR-03.5.1: RouteDecisionService Tests
 * Tests for REQ-07, REQ-09, REQ-10, REQ-11, REQ-12
 * AC-07, AC-09, AC-10, AC-11, AC-12
 */
describe('RouteDecisionService (PR-03.5.1)', () => {
  let service: RouteDecisionService;
  let intentRouter: IntentRouterService;
  let llmService: LlmService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockIntentRouter = {
      classify: jest.fn(),
    };

    const mockLlmService = {
      generateSimple: jest.fn(),
      generateConversationalResponse: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'LLM_ENABLED') return false;
        if (key === 'LLM_INTENT_ASSIST') return false;
        if (key === 'LLM_FALLBACK_ENABLED') return false;
        if (key === 'LLM_SUMMARY_ENABLED') return false;
        if (key === 'INTENT_CONFIDENCE_THRESHOLD_HIGH') return 5;
        if (key === 'INTENT_CONFIDENCE_THRESHOLD_LOW') return 2;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteDecisionService,
        {
          provide: IntentRouterService,
          useValue: mockIntentRouter,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RouteDecisionService>(RouteDecisionService);
    intentRouter = module.get<IntentRouterService>(IntentRouterService);
    llmService = module.get<LlmService>(LlmService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // REQ-07, AC-07: Template-first routing with HIGH/MED confidence
  describe('AC-07: Template-first routing', () => {
    it('should route HIGH confidence to TEMPLATE', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'GREETING',
        confidence: 'HIGH',
        reason: 'Matched keywords',
        signals: ['hola'],
        missingSlots: [],
      });

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await service.classifyAndRoute('hola', context);

      expect(decision.route).toBe('TEMPLATE');
      expect(decision.intent).toBe('GREETING');
      expect(llmService.generateSimple).not.toHaveBeenCalled();
    });

    it('should route MED confidence to TEMPLATE', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'SEARCH_PRODUCT',
        confidence: 'MED',
        reason: 'Matched keywords',
        signals: ['busco'],
        missingSlots: [],
      });

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await service.classifyAndRoute('busco', context);

      expect(decision.route).toBe('TEMPLATE');
      expect(decision.intent).toBe('SEARCH_PRODUCT');
      expect(llmService.generateSimple).not.toHaveBeenCalled();
    });
  });

  // REQ-09, AC-09: Backward compatibility with LLM_ENABLED=true
  describe('AC-09: Backward compat LLM_ENABLED=true', () => {
    it('should activate all flags when LLM_ENABLED=true', async () => {
      // Create new service instance with LLM_ENABLED=true
      const mockConfigWithLLMEnabled = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'LLM_ENABLED') return true;
          if (key === 'INTENT_CONFIDENCE_THRESHOLD_HIGH') return 5;
          if (key === 'INTENT_CONFIDENCE_THRESHOLD_LOW') return 2;
          return defaultValue;
        }),
      };

      const mockIntentRouter = {
        classify: jest.fn(),
      };

      const mockLlmService = {
        generateSimple: jest.fn(),
        generateConversationalResponse: jest.fn(),
      };

      const module = await Test.createTestingModule({
        providers: [
          RouteDecisionService,
          {
            provide: IntentRouterService,
            useValue: mockIntentRouter,
          },
          {
            provide: LlmService,
            useValue: mockLlmService,
          },
          {
            provide: ConfigService,
            useValue: mockConfigWithLLMEnabled,
          },
        ],
      }).compile();

      const serviceWithLegacy = module.get<RouteDecisionService>(RouteDecisionService);

      // Verify service was created (logs activation internally)
      expect(serviceWithLegacy).toBeDefined();

      // Verify LLM summary flag is enabled (public method)
      expect(serviceWithLegacy.isLlmSummaryEnabled()).toBe(true);
    });
  });

  // REQ-10, AC-10: LLM intent assist for UNKNOWN/AMBIGUOUS
  describe('AC-10: LLM intent assist', () => {
    it('should retry classification with LLM when UNKNOWN and LLM_INTENT_ASSIST=true', async () => {
      // Setup: LLM_INTENT_ASSIST enabled
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'LLM_INTENT_ASSIST') return true;
        if (key === 'LLM_ENABLED') return false;
        return defaultValue;
      });

      // Recreate service with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RouteDecisionService,
          {
            provide: IntentRouterService,
            useValue: intentRouter,
          },
          {
            provide: LlmService,
            useValue: llmService,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const serviceWithAssist = module.get<RouteDecisionService>(RouteDecisionService);

      // Mock IntentRouter returns UNKNOWN
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      });

      // Mock LLM intent assist returns valid intent
      jest.spyOn(llmService, 'generateSimple').mockResolvedValue('intent: ADD_TO_CART');

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
        lastIntent: 'SEARCH_PRODUCT',
      };

      const decision = await serviceWithAssist.classifyAndRoute('eso me gusta', context);

      expect(llmService.generateSimple).toHaveBeenCalled();
      expect(decision.route).toBe('TEMPLATE');
      expect(decision.intent).toBe('ADD_TO_CART');
    });

    it('should NOT call LLM when LLM_INTENT_ASSIST=false', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      });

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await service.classifyAndRoute('xyz', context);

      expect(llmService.generateSimple).not.toHaveBeenCalled();
      expect(decision.route).toBe('GENERIC'); // Falls back to GENERIC
    });
  });

  // REQ-11, AC-11: LLM fallback generation for UNKNOWN
  describe('AC-11: LLM fallback', () => {
    it('should route to LLM_FALLBACK when UNKNOWN and LLM_FALLBACK_ENABLED=true', async () => {
      // Setup: LLM_FALLBACK_ENABLED enabled
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'LLM_FALLBACK_ENABLED') return true;
        if (key === 'LLM_ENABLED') return false;
        return defaultValue;
      });

      // Recreate service
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RouteDecisionService,
          {
            provide: IntentRouterService,
            useValue: intentRouter,
          },
          {
            provide: LlmService,
            useValue: llmService,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const serviceWithFallback = module.get<RouteDecisionService>(RouteDecisionService);

      // Mock IntentRouter returns UNKNOWN
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      });

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await serviceWithFallback.classifyAndRoute('random text', context);

      expect(decision.route).toBe('LLM_FALLBACK');
      expect(decision.intent).toBe('UNKNOWN');
    });
  });

  // REQ-12, AC-12: Graceful degradation when LLM fails
  describe('AC-12: LLM failure graceful degradation', () => {
    it('should return GENERIC route when LLM intent assist fails', async () => {
      // Setup: LLM_INTENT_ASSIST enabled
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'LLM_INTENT_ASSIST') return true;
        if (key === 'LLM_ENABLED') return false;
        return defaultValue;
      });

      // Recreate service
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RouteDecisionService,
          {
            provide: IntentRouterService,
            useValue: intentRouter,
          },
          {
            provide: LlmService,
            useValue: llmService,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const serviceWithAssist = module.get<RouteDecisionService>(RouteDecisionService);

      // Mock IntentRouter returns UNKNOWN
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      });

      // Mock LLM fails
      jest.spyOn(llmService, 'generateSimple').mockRejectedValue(new Error('LLM timeout'));

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await serviceWithAssist.classifyAndRoute('xyz', context);

      expect(decision.route).toBe('GENERIC');
      expect(decision.reason).toContain('No template match');
    });

    it('should not crash when LLM response is unparseable', async () => {
      // Setup: LLM_INTENT_ASSIST enabled
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'LLM_INTENT_ASSIST') return true;
        if (key === 'LLM_ENABLED') return false;
        return defaultValue;
      });

      // Recreate service
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RouteDecisionService,
          {
            provide: IntentRouterService,
            useValue: intentRouter,
          },
          {
            provide: LlmService,
            useValue: llmService,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const serviceWithAssist = module.get<RouteDecisionService>(RouteDecisionService);

      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      });

      // Mock LLM returns invalid format
      jest.spyOn(llmService, 'generateSimple').mockResolvedValue('invalid response');

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await serviceWithAssist.classifyAndRoute('xyz', context);

      expect(decision.route).toBe('GENERIC');
    });
  });

  // Integration tests
  describe('Full routing flow', () => {
    it('should route deterministic intents to TEMPLATE without LLM', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'GREETING',
        confidence: 'HIGH',
        reason: 'Matched keywords',
        signals: ['hola'],
        missingSlots: [],
      });

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await service.classifyAndRoute('hola', context);

      expect(decision.route).toBe('TEMPLATE');
      expect(decision.intent).toBe('GREETING');
      expect(llmService.generateSimple).not.toHaveBeenCalled();
      expect(llmService.generateConversationalResponse).not.toHaveBeenCalled();
    });

    it('should fallback to GENERIC when no LLM flags enabled', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      });

      const context: RouteContext = {
        conversationId: 'conv-123',
        merchantId: 'merchant-1',
      };

      const decision = await service.classifyAndRoute('random xyz', context);

      expect(decision.route).toBe('GENERIC');
      expect(decision.intent).toBe('UNKNOWN');
    });
  });
});

// ---------------------------------------------------------------------------
// AC-04 (PR-04.0): RouteDecisionService - expecting context propagation
// REQ-05: classifyAndRoute accepts expectingState in context
// ---------------------------------------------------------------------------

describe('AC-04 (PR-04.0): RouteDecisionService - expecting context propagation', () => {
  let service: RouteDecisionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteDecisionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: IntentRouterService,
          useValue: {
            classify: jest.fn().mockReturnValue({
              intent: 'SEARCH_PRODUCT',
              confidence: 'HIGH',
              reason: 'keyword match',
              signals: ['buscar'],
              missingSlots: [],
            }),
          },
        },
        {
          provide: LlmService,
          useValue: {
            generateSimple: jest.fn(),
            generateConversationalResponse: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RouteDecisionService>(RouteDecisionService);
  });

  it('AC-04: should accept RouteContext with expectingState and return TEMPLATE route', async () => {
    const context: RouteContext = {
      conversationId: 'conv-1',
      merchantId: 'merch-1',
      expectingState: {
        flow: 'search_selection',
        type: 'select_product',
        data: { products: [{ id: 'p1', name: 'Product', price: 10000, stock: 5 }] },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    };

    const decision = await service.classifyAndRoute('2', context);

    // Route still determined by IntentRouter (expecting state is context, not override in PR-04.0)
    expect(decision.route).toBe('TEMPLATE');
    expect(decision).toBeDefined();
  });

  it('AC-04: should accept RouteContext without expectingState (backward compat)', async () => {
    const context: RouteContext = {
      conversationId: 'conv-1',
      merchantId: 'merch-1',
      // expectingState: undefined — optional field
    };

    const decision = await service.classifyAndRoute('buscar camiseta', context);

    expect(decision.route).toBe('TEMPLATE');
    expect(decision).toBeDefined();
  });
});
