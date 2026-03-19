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
import { PaymentFallbackFlow } from './flows/payment-fallback.flow'; // PR-06
import { PostSaleFlow } from './flows/post-sale.flow'; // PR-07
import { HandoffFlow } from './flows/handoff.flow'; // PR-08
import { HandoffService } from '../services/handoff.service'; // PR-08
import { MerchantCommandParserService } from '../services/merchant-command-parser.service'; // PR-05.1
import { MerchantCommandService } from '../services/merchant-command.service'; // PR-05.1
import { MessageRelayService } from '../services/message-relay.service'; // PR-05.2
import { LlmService } from '../llm/llm.service';
import { Customer, Merchant, Conversation, ConversationType, MerchantStatus } from '@prisma/client';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository'; // PR-03.10
import { MemoryConfigService } from '../common/config/memory-config.service'; // PR-03.10
import { PlaybookService, MerchantPlaybookData } from '../services/playbook.service'; // PR-04.2
import { ExpectingService } from '../services/expecting.service'; // PR-04.2
import { CartService } from '../services/cart.service'; // PR-04.2
import { PlaybookMessages } from '../domain/entities/playbook-config.interface'; // PR-04.2
import { GenericPlaybookDefaults } from '../domain/entities/playbook-defaults/generic.config'; // PR-04.2

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
    botPaused: false, // PR-05.1
    status: MerchantStatus.active, // PR-OB-01: merchant must be active to process messages
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
    type: ConversationType.CUSTOMER, // PR-05.1: ConversationType.CUSTOMER
    status: 'active',
    handoffActive: false, // PR-05.2
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
            updateLastIntent: jest.fn().mockResolvedValue(undefined),
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
            extractCartAction: jest.fn().mockReturnValue(null), // PR-04.2
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
            handleAskQuantity: jest.fn().mockResolvedValue('Ask quantity'),
            handleSelectQuantity: jest.fn().mockResolvedValue('Quantity updated'),
          },
        },
        {
          provide: RemoveFromCartFlow,
          useValue: {
            execute: jest.fn().mockResolvedValue('Item removed'),
            handleSelectAction: jest.fn().mockResolvedValue('Select action'),
            handleDirectAction: jest.fn().mockResolvedValue('Direct action'),
            handleConfirmRemove: jest.fn().mockResolvedValue('Item removed'),
            handleCancel: jest.fn().mockResolvedValue('Cancelled'),
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
          provide: PaymentFallbackFlow, // PR-06
          useValue: {
            getActiveState: jest.fn().mockResolvedValue(null), // no active payment fallback by default
            handle: jest.fn().mockResolvedValue('Payment fallback response'),
          },
        },
        {
          provide: PostSaleFlow, // PR-07
          useValue: {
            getActiveState: jest.fn().mockResolvedValue(null), // no active post-sale by default
            handle: jest.fn().mockResolvedValue('Post-sale response'),
            handleOrderStatus: jest.fn().mockResolvedValue('Order status response'),
            handleCreateTicket: jest.fn().mockResolvedValue('Ticket created response'),
          },
        },
        // PR-08: HandoffFlow + HandoffService mocks
        {
          provide: HandoffFlow,
          useValue: {
            handle: jest.fn().mockResolvedValue('Te conecto con nuestro equipo. Un momento...'),
          },
        },
        {
          provide: HandoffService,
          useValue: {
            detectHandoff: jest.fn().mockReturnValue(false),
            createHandoff: jest.fn().mockResolvedValue({ id: 'handoff-1', status: 'pending' }),
            generateSummary: jest.fn().mockResolvedValue({}),
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
        // PR-05.1: Merchant command services
        {
          provide: MerchantCommandParserService,
          useValue: {
            parse: jest
              .fn()
              .mockReturnValue({ command: 'confirmar', args: { orderCode: 'ORD-001' } }),
          },
        },
        {
          provide: MerchantCommandService,
          useValue: {
            executeCommand: jest.fn().mockResolvedValue('✅ Pedido ORD-001 confirmado'),
          },
        },
        // PR-05.2: Message relay service
        {
          provide: MessageRelayService,
          useValue: {
            relayCustomerMessageToMerchant: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PlaybookService, // PR-04.2
          useValue: {
            getMessage: jest
              .fn()
              .mockImplementation(
                (
                  merchant: MerchantPlaybookData,
                  key: keyof PlaybookMessages,
                  placeholders?: Record<string, string | number>,
                ) => {
                  let template: string = GenericPlaybookDefaults.messages[key] ?? String(key);
                  if (placeholders) {
                    for (const [k, v] of Object.entries(placeholders)) {
                      template = template.replace(`{${k}}`, String(v));
                    }
                  }
                  return template;
                },
              ),
          },
        },
        {
          provide: ExpectingService, // PR-04.2
          useValue: {
            getExpecting: jest.fn().mockResolvedValue(null),
            setExpecting: jest.fn().mockResolvedValue(undefined),
            clearExpecting: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CartService, // PR-04.2
          useValue: { getVariantStockForItem: jest.fn().mockResolvedValue(10) },
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
        expect.anything(), // conversationId (PR-04.0)
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
      expect(result.response).toBe('No entendí tu mensaje. Escribe "ayuda" para ver opciones.');
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
        expect.anything(), // conversationId (PR-04.0)
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

    // -------------------------------------------------------------------------
    // PR-05.1: Bifurcation tests
    // -------------------------------------------------------------------------
    describe('PR-05.1 AC-02: Merchant admin message routing', () => {
      it('AC-02: should route merchant messages to admin pipeline (phone match)', async () => {
        // Merchant's phone is '+573001111111' (mockMerchant.whatsappNumber)
        const merchantInput = {
          messageId: 'msg-merchant-001',
          from: '+573001111111', // matches merchant.whatsappNumber
          receiverPhoneId: 'phone-id-123',
          text: 'confirmar ORD-001',
          timestamp: new Date(),
        };

        // resolveByWhatsAppPhoneId called first for merchant lookup
        const result = await orchestrator.process(merchantInput);

        // Should be handled by merchant admin pipeline (not routeDecisionService)
        expect(routeDecisionService.classifyAndRoute).not.toHaveBeenCalled();
        expect(result.shouldSend).toBe(true);
        expect(result.response).toBe('✅ Pedido ORD-001 confirmado');
      });
    });

    describe('PR-05.1 AC-03: Customer messages follow normal pipeline', () => {
      it('AC-03: should route customer messages (non-merchant phone) to normal pipeline', async () => {
        // Customer phone is '+573001234567' (different from merchant.whatsappNumber)
        jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
          route: 'TEMPLATE',
          intent: 'GREETING',
          reason: 'HIGH confidence',
          confidence: 'HIGH',
          signals: ['hola'],
        });

        const customerInput = {
          messageId: 'msg-customer-001',
          from: '+573001234567', // NOT merchant.whatsappNumber
          receiverPhoneId: 'phone-id-123',
          text: 'hola',
          timestamp: new Date(),
        };

        const result = await orchestrator.process(customerInput);

        // Should go through normal route decision
        expect(routeDecisionService.classifyAndRoute).toHaveBeenCalled();
        expect(result.intent).toBe('GREETING');
      });
    });

    describe('PR-05.1 AC-14: botPaused blocks customer messages', () => {
      it('AC-14: should return shouldSend=false when merchant.botPaused=true', async () => {
        // Setup paused merchant
        const pausedMerchant = { ...mockMerchant, botPaused: true };
        jest.spyOn(merchantResolver, 'resolveByWhatsAppPhoneId').mockResolvedValue(pausedMerchant);

        const result = await orchestrator.process({
          ...baseInput,
          from: '+573001234567', // customer (not merchant phone)
          text: 'buscar zapatos',
        });

        expect(result.shouldSend).toBe(false);
        expect(result.response).toBe('');
        // routeDecision should NOT be called
        expect(routeDecisionService.classifyAndRoute).not.toHaveBeenCalled();
      });
    });

    describe('PR-OB-01 AC-09: merchant status guards customer messages', () => {
      it('AC-09: should return "Tienda en configuración" when merchant.status=onboarding', async () => {
        const onboardingMerchant = { ...mockMerchant, status: MerchantStatus.onboarding };
        jest
          .spyOn(merchantResolver, 'resolveByWhatsAppPhoneId')
          .mockResolvedValue(onboardingMerchant);

        const result = await orchestrator.process({
          ...baseInput,
          from: '+573001234567',
          text: 'Hola, ¿tienen zapatos?',
        });

        expect(result.shouldSend).toBe(true);
        expect(result.response).toBe('Tienda en configuración. Por favor intenta más tarde.');
        expect(routeDecisionService.classifyAndRoute).not.toHaveBeenCalled();
      });

      it('AC-09: should return "Tienda en configuración" when merchant.status=paused', async () => {
        const pausedStatusMerchant = { ...mockMerchant, status: MerchantStatus.paused };
        jest
          .spyOn(merchantResolver, 'resolveByWhatsAppPhoneId')
          .mockResolvedValue(pausedStatusMerchant);

        const result = await orchestrator.process({
          ...baseInput,
          from: '+573001234567',
          text: 'Hola',
        });

        expect(result.shouldSend).toBe(true);
        expect(result.response).toBe('Tienda en configuración. Por favor intenta más tarde.');
        expect(routeDecisionService.classifyAndRoute).not.toHaveBeenCalled();
      });

      it('AC-09: should process normally when merchant.status=active', async () => {
        // mockMerchant already has status=active
        jest.spyOn(merchantResolver, 'resolveByWhatsAppPhoneId').mockResolvedValue(mockMerchant);

        const result = await orchestrator.process({
          ...baseInput,
          from: '+573001234567',
          text: 'Hola',
        });

        // Should proceed to normal processing
        expect(result.shouldSend).toBe(true);
        expect(result.response).not.toBe('Tienda en configuración. Por favor intenta más tarde.');
      });
    });

    // -------------------------------------------------------------------------
    // PR-04.2: Cart management expecting pre-check
    // AC-06: confirm_action → handleConfirmRemove
    // AC-09: select_action/confirm_action/select_quantity dispatching
    // -------------------------------------------------------------------------
    describe('PR-04.2: cart_management expecting pre-check', () => {
      let expectingService: ExpectingService;
      let removeFromCartFlow: RemoveFromCartFlow;
      let updateCartItemFlow: UpdateCartItemFlow;
      let cartService: CartService;

      beforeEach(() => {
        expectingService = orchestrator['expectingService'] as ExpectingService;
        removeFromCartFlow = orchestrator['removeFromCartFlow'] as RemoveFromCartFlow;
        updateCartItemFlow = orchestrator['updateCartItemFlow'] as UpdateCartItemFlow;
        cartService = orchestrator['cartService'] as CartService;
      });

      const cartItems = [{ id: 'item-1', name: 'Camiseta', qty: 1 }];
      const futureExpiry = new Date(Date.now() + 600000).toISOString();

      it('AC-09: cart_management expecting active → routes to handleCartManagementExpecting (not intent router)', async () => {
        jest.spyOn(expectingService, 'getExpecting').mockResolvedValue({
          flow: 'cart_management',
          type: 'select_action',
          data: { cartItems },
          expiresAt: futureExpiry,
        });
        jest
          .spyOn(removeFromCartFlow, 'handleSelectAction')
          .mockResolvedValue('menu de confirmación');

        const result = await orchestrator.process({
          ...baseInput,
          text: 'eliminar 1',
        });

        expect(result.intent).toBe('MANAGE_CART');
        expect(result.shouldSend).toBe(true);
        expect(routeDecisionService.classifyAndRoute).not.toHaveBeenCalled();
        expect(removeFromCartFlow.handleSelectAction).toHaveBeenCalled();
      });

      it('AC-06: e2e: confirm_action option 1 (remove) → handleConfirmRemove called', async () => {
        jest.spyOn(expectingService, 'getExpecting').mockResolvedValue({
          flow: 'cart_management',
          type: 'confirm_action',
          data: {
            cartItems,
            pendingAction: 'remove',
            selectedItemIndex: 1,
          },
          expiresAt: futureExpiry,
        });
        jest
          .spyOn(removeFromCartFlow, 'handleConfirmRemove')
          .mockResolvedValue('Camiseta eliminada');

        const result = await orchestrator.process({
          ...baseInput,
          text: '1',
        });

        expect(result.shouldSend).toBe(true);
        expect(removeFromCartFlow.handleConfirmRemove).toHaveBeenCalled();
      });

      it('AC-09: e2e: confirm_action option 2 → handleAskQuantity called (regardless of pendingAction)', async () => {
        jest.spyOn(expectingService, 'getExpecting').mockResolvedValue({
          flow: 'cart_management',
          type: 'confirm_action',
          data: {
            cartItems,
            pendingAction: 'remove',
            selectedItemIndex: 1,
          },
          expiresAt: futureExpiry,
        });
        jest.spyOn(cartService, 'getVariantStockForItem').mockResolvedValue(10);
        jest.spyOn(updateCartItemFlow, 'handleAskQuantity').mockResolvedValue('Cuántas unidades?');

        const result = await orchestrator.process({
          ...baseInput,
          text: '2',
        });

        expect(result.shouldSend).toBe(true);
        expect(updateCartItemFlow.handleAskQuantity).toHaveBeenCalled();
      });

      it('AC-09: e2e: confirm_action option 3 (cancel) → handleCancel called, NOT handleConfirmRemove', async () => {
        jest.spyOn(expectingService, 'getExpecting').mockResolvedValue({
          flow: 'cart_management',
          type: 'confirm_action',
          data: {
            cartItems,
            pendingAction: 'remove',
            selectedItemIndex: 1,
          },
          expiresAt: futureExpiry,
        });
        jest.spyOn(removeFromCartFlow, 'handleCancel').mockResolvedValue('Acción cancelada');
        jest
          .spyOn(removeFromCartFlow, 'handleConfirmRemove')
          .mockResolvedValue('should not be called');

        const result = await orchestrator.process({
          ...baseInput,
          text: '3',
        });

        expect(result.shouldSend).toBe(true);
        expect(removeFromCartFlow.handleCancel).toHaveBeenCalled();
        expect(removeFromCartFlow.handleConfirmRemove).not.toHaveBeenCalled();
      });

      it('AC-09: e2e: select_quantity → handleSelectQuantity called', async () => {
        jest.spyOn(expectingService, 'getExpecting').mockResolvedValue({
          flow: 'cart_management',
          type: 'select_quantity',
          data: {
            selectedProduct: { id: 'item-1', name: 'Camiseta' },
            maxStock: 10,
          },
          expiresAt: futureExpiry,
        });
        jest
          .spyOn(updateCartItemFlow, 'handleSelectQuantity')
          .mockResolvedValue('Cantidad actualizada');

        const result = await orchestrator.process({
          ...baseInput,
          text: '3',
        });

        expect(result.shouldSend).toBe(true);
        expect(updateCartItemFlow.handleSelectQuantity).toHaveBeenCalled();
      });
    });

    describe('PR-05.2 AC-07: handoffActive relay — customer message relayed to merchant', () => {
      it('AC-07: should relay customer message when handoffActive = true (NO flows/LLM)', async () => {
        // Conversation with handoffActive = true
        const handoffConversation = { ...mockConversation, handoffActive: true };
        jest
          .spyOn(conversationService, 'getOrCreateConversation')
          .mockResolvedValue(handoffConversation);

        const result = await orchestrator.process({
          ...baseInput,
          from: '+573001234567', // customer
          text: 'Hola, ¿cuándo llega mi pedido?',
        });

        // Should NOT call routeDecision or flows
        expect(routeDecisionService.classifyAndRoute).not.toHaveBeenCalled();
        // Should return shouldSend=false (merchant receives relay, no response to customer)
        expect(result.shouldSend).toBe(false);
        expect(result.intent).toBe('HANDOFF');
      });

      it('AC-07: should process normally when handoffActive = false', async () => {
        jest
          .spyOn(conversationService, 'getOrCreateConversation')
          .mockResolvedValue({ ...mockConversation, handoffActive: false });
        jest.spyOn(routeDecisionService, 'classifyAndRoute').mockResolvedValue({
          route: 'TEMPLATE',
          intent: 'GREETING',
          reason: 'keyword match',
          confidence: 'HIGH',
          signals: ['hola'],
        });

        const result = await orchestrator.process({
          ...baseInput,
          from: '+573001234567',
          text: 'hola',
        });

        // Should call normal routing
        expect(routeDecisionService.classifyAndRoute).toHaveBeenCalled();
        expect(result.shouldSend).toBe(true);
      });
    });
  });
});
