import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationOrchestrator } from './conversation.orchestrator';
import { IntentRouterService } from './intent/intent-router.service';
import { CustomerService } from '../services/customer.service';
import { ConversationService } from '../services/conversation.service';
import { MerchantResolverService } from '../services/merchant-resolver.service';
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { LlmService } from '../llm/llm.service';
import { Customer, Merchant, Conversation } from '@prisma/client';

describe('ConversationOrchestrator', () => {
  let orchestrator: ConversationOrchestrator;
  let merchantResolver: MerchantResolverService;
  let customerService: CustomerService;
  let conversationService: ConversationService;
  let intentRouter: IntentRouterService;
  let searchCatalogFlow: SearchCatalogFlow;
  let greetingFlow: GreetingFlow;
  let helpFlow: HelpFlow;

  const mockMerchant: Merchant = {
    id: 'merchant-1',
    name: 'Test Store',
    whatsappNumber: '+573001111111',
    apiKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomer: Customer = {
    id: 'customer-1',
    phone: '+573001234567',
    name: 'Test Customer',
    language: 'es',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockConversation: Conversation = {
    id: 'conv-1',
    customerId: 'customer-1',
    merchantId: 'merchant-1',
    channel: 'whatsapp',
    status: 'active',
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationOrchestrator,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'LLM_ENABLED') return false;
              return defaultValue;
            }),
          },
        },
        {
          provide: MerchantResolverService,
          useValue: {
            resolveByWhatsAppPhoneId: jest.fn().mockResolvedValue(mockMerchant),
          },
        },
        {
          provide: CustomerService,
          useValue: {
            resolveByPhone: jest.fn().mockResolvedValue(mockCustomer),
          },
        },
        {
          provide: ConversationService,
          useValue: {
            getOrCreateConversation: jest.fn().mockResolvedValue(mockConversation),
          },
        },
        {
          provide: IntentRouterService,
          useValue: {
            classify: jest.fn(),
          },
        },
        {
          provide: SearchCatalogFlow,
          useValue: {
            handle: jest.fn().mockResolvedValue('Product search results'),
          },
        },
        {
          provide: GreetingFlow,
          useValue: {
            handle: jest.fn().mockResolvedValue('Hello! Welcome to our store'),
          },
        },
        {
          provide: HelpFlow,
          useValue: {
            handle: jest.fn().mockResolvedValue('Help information'),
          },
        },
        {
          provide: LlmService,
          useValue: {
            generateConversationalResponse: jest.fn(),
          },
        },
      ],
    }).compile();

    orchestrator = module.get<ConversationOrchestrator>(ConversationOrchestrator);
    merchantResolver = module.get<MerchantResolverService>(MerchantResolverService);
    customerService = module.get<CustomerService>(CustomerService);
    conversationService = module.get<ConversationService>(ConversationService);
    intentRouter = module.get<IntentRouterService>(IntentRouterService);
    searchCatalogFlow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    greetingFlow = module.get<GreetingFlow>(GreetingFlow);
    helpFlow = module.get<HelpFlow>(HelpFlow);
  });

  it('should be defined', () => {
    expect(orchestrator).toBeDefined();
  });

  describe('process()', () => {
    const baseInput = {
      messageId: 'msg-123',
      from: '+573001234567',
      receiverPhoneId: 'phone-id-123',
      text: 'test message',
      timestamp: new Date(),
    };

    it('should process greeting message', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'GREETING',
        confidence: 0.9,
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'hola',
      });

      expect(result.intent).toBe('GREETING');
      expect(result.shouldSend).toBe(true);
      expect(result.conversationId).toBe('conv-1');
      expect(result.response).toBeDefined();
      expect(greetingFlow.handle).toHaveBeenCalledWith('Test Customer');
    });

    it('should process help message', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'HELP',
        confidence: 0.9,
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'ayuda',
      });

      expect(result.intent).toBe('HELP');
      expect(result.shouldSend).toBe(true);
      expect(helpFlow.handle).toHaveBeenCalled();
    });

    it('should process search product message', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'SEARCH_PRODUCT',
        confidence: 0.8,
        entities: {
          query: 'zapatillas',
        },
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'busco zapatillas',
      });

      expect(result.intent).toBe('SEARCH_PRODUCT');
      expect(result.shouldSend).toBe(true);
      expect(searchCatalogFlow.handle).toHaveBeenCalledWith('merchant-1', 'zapatillas');
    });

    it('should handle unknown intent with fallback search', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'UNKNOWN',
        confidence: 0.5,
        entities: {
          query: 'random text',
        },
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'random text',
      });

      expect(result.intent).toBe('UNKNOWN');
      expect(result.shouldSend).toBe(true);
      expect(searchCatalogFlow.handle).toHaveBeenCalledWith('merchant-1', 'random text');
    });

    it('should resolve merchant, customer, and conversation', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'GREETING',
        confidence: 0.9,
      });

      await orchestrator.process(baseInput);

      expect(merchantResolver.resolveByWhatsAppPhoneId).toHaveBeenCalledWith('phone-id-123');
      expect(customerService.resolveByPhone).toHaveBeenCalledWith('+573001234567');
      expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith(
        'customer-1',
        'merchant-1',
        'whatsapp',
      );
    });

    it('should handle customer without name', async () => {
      const customerWithoutName = { ...mockCustomer, name: null };
      jest.spyOn(customerService, 'resolveByPhone').mockResolvedValue(customerWithoutName);
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'GREETING',
        confidence: 0.9,
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'hola',
      });

      expect(result.response).toBeDefined();
      expect(greetingFlow.handle).toHaveBeenCalledWith(undefined);
    });

    it('should use full text as query when no query extracted', async () => {
      jest.spyOn(intentRouter, 'classify').mockReturnValue({
        intent: 'SEARCH_PRODUCT',
        confidence: 0.8,
        entities: {}, // No query extracted
      });

      await orchestrator.process({
        ...baseInput,
        text: 'some text',
      });

      expect(searchCatalogFlow.handle).toHaveBeenCalledWith('merchant-1', 'some text');
    });
  });
});
