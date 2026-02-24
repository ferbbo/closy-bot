import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationOrchestrator } from './conversation.orchestrator';
import { IntentRouterService } from './intent/intent-router.service';
import { RouteDecisionService } from './route-decision.service'; // PR-03.5.1
import { CustomerService } from '../services/customer.service';
import { ConversationService } from '../services/conversation.service';
import { MerchantResolverService } from '../services/merchant-resolver.service';
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { AddToCartFlow } from './flows/add-to-cart.flow'; // PR-04
import { ViewCartFlow } from './flows/view-cart.flow'; // PR-04
import { UpdateCartItemFlow } from './flows/update-cart-item.flow'; // PR-04
import { RemoveFromCartFlow } from './flows/remove-from-cart.flow'; // PR-04
import { FaqFlow } from './flows/faq.flow'; // PR-GAP-2
import { CheckoutFlow } from './flows/checkout.flow'; // PR-05
import { LlmService } from '../llm/llm.service';
import { Customer, Merchant, Conversation } from '@prisma/client';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository'; // PR-03.10
import { MemoryConfigService } from '../common/config/memory-config.service'; // PR-03.10

describe('ConversationOrchestrator', () => {
  let orchestrator: ConversationOrchestrator;
  let merchantResolver: MerchantResolverService;
  let customerService: CustomerService;
  let conversationService: ConversationService;
  let routeDecisionService: RouteDecisionService; // PR-03.5.1
  let searchCatalogFlow: SearchCatalogFlow;
  let greetingFlow: GreetingFlow;
  let helpFlow: HelpFlow;
  let addToCartFlow: AddToCartFlow;

  const mockMerchant: Merchant = {
    id: 'merchant-1',
    name: 'Test Store',
    whatsappNumber: '+573001111111',
    apiKey: 'test-key',
    industry: null,
    playbookConfig: null,
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
          provide: RouteDecisionService,
          useValue: {
            classifyAndRoute: jest.fn().mockResolvedValue({
              route: 'TEMPLATE',
              intent: 'GREETING',
              reason: 'Template route',
              confidence: 'HIGH',
              signals: ['hola'],
            }),
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
          provide: AddToCartFlow,
          useValue: {
            execute: jest.fn().mockResolvedValue('Item added to cart'),
          },
        },
        {
          provide: ViewCartFlow,
          useValue: {
            execute: jest.fn().mockResolvedValue('Cart summary'),
          },
        },
        {
          provide: UpdateCartItemFlow,
          useValue: {
            execute: jest.fn().mockResolvedValue('Quantity updated'),
          },
        },
        {
          provide: RemoveFromCartFlow,
          useValue: {
            execute: jest.fn().mockResolvedValue('Item removed'),
          },
        },
        {
          provide: FaqFlow, // PR-GAP-2
          useValue: {
            handle: jest.fn().mockReturnValue(null), // returns null by default (no FAQ match)
          },
        },
        {
          provide: CheckoutFlow, // PR-05
          useValue: {
            getActiveState: jest.fn().mockResolvedValue(null), // no active checkout by default
            handle: jest.fn().mockResolvedValue('Checkout response'),
          },
        },
        {
          provide: LlmService,
          useValue: {
            generateConversationalResponse: jest.fn(),
          },
        },
        {
          provide: MessageLogRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'log-1' }),
            findLastKByConversation: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: MemoryConfigService,
          useValue: {
            getMessageHistoryDays: jest.fn().mockReturnValue(30),
            getMessageHistoryMaxPerConvo: jest.fn().mockReturnValue(50),
            getLlmContextLastK: jest.fn().mockReturnValue(10),
          },
        },
      ],
    }).compile();

    orchestrator = module.get<ConversationOrchestrator>(ConversationOrchestrator);
    merchantResolver = module.get<MerchantResolverService>(MerchantResolverService);
    customerService = module.get<CustomerService>(CustomerService);
    conversationService = module.get<ConversationService>(ConversationService);
    routeDecisionService = module.get<RouteDecisionService>(RouteDecisionService); // PR-03.5.1
    searchCatalogFlow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    greetingFlow = module.get<GreetingFlow>(GreetingFlow);
    helpFlow = module.get<HelpFlow>(HelpFlow);
    addToCartFlow = module.get<AddToCartFlow>(AddToCartFlow);
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
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'GREETING',
        reason: 'HIGH confidence keyword match',
        confidence: 'HIGH',
        signals: ['hola'],
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'hola',
      });

      expect(result.intent).toBe('GREETING');
      expect(result.shouldSend).toBe(true);
      expect(result.conversationId).toBe('conv-1');
      expect(result.response).toBeDefined();
      expect(greetingFlow.handle).toHaveBeenCalledWith('Test Customer', {
        id: 'merchant-1',
        name: 'Test Store',
        industry: undefined,
        playbookConfig: null,
      });
    });

    it('should process help message', async () => {
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'HELP',
        reason: 'HIGH confidence keyword match',
        confidence: 'HIGH',
        signals: ['ayuda'],
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
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'SEARCH_PRODUCT',
        reason: 'HIGH confidence keyword match',
        confidence: 'HIGH',
        signals: ['busco'],
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'busco zapatillas',
      });

      expect(result.intent).toBe('SEARCH_PRODUCT');
      expect(result.shouldSend).toBe(true);
      // V2 passes full text (no entity extraction)
      expect(searchCatalogFlow.handle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'merchant-1', name: 'Test Store' }),
        'merchant-1',
        'busco zapatillas',
      );
    });

    it('should handle unknown intent with fallback search', async () => {
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'GENERIC',
        intent: 'UNKNOWN',
        reason: 'Low confidence, no LLM flags',
        confidence: 'LOW',
        signals: [],
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'random text',
      });

      expect(result.intent).toBe('UNKNOWN');
      expect(result.shouldSend).toBe(true);
      // V2: GENERIC route returns hardcoded message, no searchCatalogFlow call
      expect(searchCatalogFlow.handle).not.toHaveBeenCalled();
      // AC-12: Exact message from brief
      expect(result.response).toBe("No entendí, escribe 'ayuda'");
    });

    it('should resolve merchant, customer, and conversation', async () => {
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'GREETING',
        reason: 'HIGH confidence',
      });

      await orchestrator.process(baseInput);

      expect(merchantResolver.resolveByWhatsAppPhoneId).toHaveBeenCalledWith('phone-id-123');
      expect(customerService.resolveByPhone).toHaveBeenCalledWith('+573001234567');
      expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith(
        'customer-1',
        'merchant-1',
        'whatsapp',
        null, // PR-03.11: channelId is null for legacy inputs
      );
    });

    it('should handle customer without name', async () => {
      const customerWithoutName = { ...mockCustomer, name: null };
      jest.spyOn(customerService, 'resolveByPhone').mockResolvedValue(customerWithoutName);
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'GREETING',
        reason: 'HIGH confidence',
        confidence: 'HIGH',
        signals: ['hola'],
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'hola',
      });

      expect(result.response).toBeDefined();
      expect(greetingFlow.handle).toHaveBeenCalledWith(undefined, {
        id: 'merchant-1',
        name: 'Test Store',
        industry: undefined,
        playbookConfig: null,
      });
    });

    it('should use full text as query when no query extracted', async () => {
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'SEARCH_PRODUCT',
        reason: 'HIGH confidence',
        confidence: 'HIGH',
        signals: ['text'],
      });

      await orchestrator.process({
        ...baseInput,
        text: 'some text',
      });

      expect(searchCatalogFlow.handle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'merchant-1' }),
        'merchant-1',
        'some text',
      );
    });

    it('AC-12: should route ADD_TO_CART to AddToCartFlow.execute', async () => {
      jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
        route: 'TEMPLATE',
        intent: 'ADD_TO_CART',
        reason: 'HIGH confidence',
        confidence: 'HIGH',
        signals: ['agregar'],
      });

      const result = await orchestrator.process({
        ...baseInput,
        text: 'quiero agregar una camiseta roja',
      });

      expect(result.intent).toBe('ADD_TO_CART');
      expect(result.shouldSend).toBe(true);
      // V2 passes full text (no entity extraction)
      expect(addToCartFlow.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'merchant-1', name: 'Test Store' }),
        mockCustomer.id,
        mockMerchant.id,
        'quiero agregar una camiseta roja',
        'quiero agregar una camiseta roja',
      );
      expect(result.response).toBe('Item added to cart');
    });
  });
});
