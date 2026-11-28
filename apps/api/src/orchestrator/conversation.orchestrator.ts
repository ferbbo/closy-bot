import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageDirection, ChannelType, ConversationType } from '@prisma/client'; // PR-03.10, PR-03.11, PR-05.1
import { Channel } from '../domain/entities/conversation.entity'; // PR-03.11
import type { IntentKey } from './types/intent.types'; // PR-03.5.1
import { RouteDecisionService } from './route-decision.service'; // PR-03.5.1
import { CustomerService } from '../services/customer.service';
import { ConversationService } from '../services/conversation.service';
import { MerchantResolverService } from '../services/merchant-resolver.service';
import { PlaybookService, type MerchantPlaybookData } from '../services/playbook.service';
import { ExpectingService } from '../services/expecting.service'; // PR-04.1 + PR-04.2
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { AddToCartFlow } from './flows/add-to-cart.flow'; // PR-04 AC-07
import { ViewCartFlow } from './flows/view-cart.flow'; // PR-04 AC-08
import { UpdateCartItemFlow } from './flows/update-cart-item.flow'; // PR-04 AC-09
import { RemoveFromCartFlow } from './flows/remove-from-cart.flow'; // PR-04 AC-10
import { FaqFlow } from './flows/faq.flow'; // PR-GAP-2
import { CheckoutFlow } from './flows/checkout.flow'; // PR-05 AC-05
import { PaymentFallbackFlow } from './flows/payment-fallback.flow'; // PR-06
import { PostSaleFlow } from './flows/post-sale.flow'; // PR-07
import { HandoffFlow } from './flows/handoff.flow'; // PR-08
import { HandoffService } from '../services/handoff.service'; // PR-08
import { MerchantCommandParserService } from '../services/merchant-command-parser.service'; // PR-05.1
import { MerchantCommandService } from '../services/merchant-command.service'; // PR-05.1
import { MessageRelayService } from '../services/message-relay.service'; // PR-05.2
import { LlmService } from '../llm/llm.service';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository'; // PR-03.10
import { MemoryConfigService } from '../common/config/memory-config.service'; // PR-03.10 AC-06
import { parseNumericSelection } from '../common/helpers/selection-helpers'; // PR-04.2
import { CartService } from '../services/cart.service'; // PR-04.2

export interface OrchestratorInput {
  messageId: string;
  from: string; // sender phone
  receiverPhoneId: string; // WhatsApp phone number ID (deprecated, use merchantId+channelId)
  text: string;
  timestamp: Date;
  merchantId?: string; // PR-03.11: Pre-resolved from controller
  channelId?: string; // PR-03.11: Pre-resolved from controller
}

export interface OrchestratorResult {
  response: string;
  shouldSend: boolean;
  conversationId: string;
  merchantId: string;
  intent: IntentKey; // PR-03.5.1: Updated to IntentKey
}

/**
 * ConversationOrchestrator
 * PR-03.5.1: Rewritten with template-first routing via RouteDecisionService
 * REQ-08, AC-08: Removed binary toggle `this.llmEnabled` for granular LLM flags
 *
 * Pipeline:
 * 1. Resolve merchant
 * 2. Resolve/create customer
 * 3. Resolve/create conversation
 * 4. PR-03.10: Log inbound message (REQ-07, AC-07)
 * 5. PR-03.5.1: RouteDecisionService.classifyAndRoute() → RouteDecision
 * 6. Execute flow based on route type (TEMPLATE / LLM_FALLBACK / GENERIC)
 * 7. Return response
 */
@Injectable()
export class ConversationOrchestrator {
  private readonly logger = new Logger(ConversationOrchestrator.name);

  /**
   * PR-08 REQ-04, AC-06: UNKNOWN loop counter per conversation (in-memory, resets on restart)
   * Brief explicitly allows "en memoria o metadata" for this counter.
   * Counter resets when any non-UNKNOWN intent is detected.
   */
  private readonly unknownLoopCounters = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly merchantResolver: MerchantResolverService,
    private readonly customerService: CustomerService,
    private readonly conversationService: ConversationService,
    private readonly routeDecisionService: RouteDecisionService, // PR-03.5.1: NEW
    private readonly searchCatalogFlow: SearchCatalogFlow,
    private readonly greetingFlow: GreetingFlow,
    private readonly helpFlow: HelpFlow,
    private readonly addToCartFlow: AddToCartFlow, // PR-04 AC-07
    private readonly viewCartFlow: ViewCartFlow, // PR-04 AC-08
    private readonly updateCartItemFlow: UpdateCartItemFlow, // PR-04 AC-09
    private readonly removeFromCartFlow: RemoveFromCartFlow, // PR-04 AC-10
    private readonly faqFlow: FaqFlow, // PR-GAP-2 AC-05
    private readonly checkoutFlow: CheckoutFlow, // PR-05
    private readonly paymentFallbackFlow: PaymentFallbackFlow, // PR-06
    private readonly postSaleFlow: PostSaleFlow, // PR-07
    private readonly handoffFlow: HandoffFlow, // PR-08
    private readonly handoffService: HandoffService, // PR-08
    private readonly merchantCommandParser: MerchantCommandParserService, // PR-05.1
    private readonly merchantCommandService: MerchantCommandService, // PR-05.1
    private readonly messageRelayService: MessageRelayService, // PR-05.2
    private readonly llmService: LlmService,
    private readonly messageLogRepository: MessageLogRepository, // PR-03.10
    private readonly memoryConfigService: MemoryConfigService, // PR-03.10 AC-06
    private readonly playbookService: PlaybookService, // Fix: para usar unknownIntent del playbook
    private readonly expectingService: ExpectingService, // PR-04.1 + PR-04.2
    private readonly cartService: CartService, // PR-04.2
  ) {
    // PR-03.5.1, REQ-08, AC-08: Removed `this.llmEnabled` binary toggle
  }

  /**
   * Process inbound message and generate response
   * PR-03.11: Supports pre-resolved merchantId+channelId for multi-channel routing
   * PR-03.5.1: Template-first routing with RouteDecisionService
   *
   * @param input - OrchestratorInput with message details
   * @returns OrchestratorResult with response and metadata
   */
  async process(input: OrchestratorInput): Promise<OrchestratorResult> {
    const maskedPhone = this.maskPhone(input.from);
    this.logger.log(`Processing message ${input.messageId} from ${maskedPhone}`);

    // 1. Resolve merchant (PR-03.11: use pre-resolved or fallback to legacy resolution)
    let merchant: Awaited<ReturnType<typeof this.merchantResolver.resolveByWhatsAppPhoneId>>;
    if (input.merchantId) {
      // PR-03.11: Merchant already resolved by controller
      const resolved = await this.merchantResolver.resolveByChannel(
        ChannelType.WHATSAPP,
        input.receiverPhoneId,
      );
      if (!resolved) {
        throw new Error(`Merchant ${input.merchantId} not found`);
      }
      merchant = resolved.merchant;
    } else {
      // Legacy: resolve by phone ID
      merchant = await this.merchantResolver.resolveByWhatsAppPhoneId(input.receiverPhoneId);
    }
    this.logger.debug(`Merchant resolved: ${merchant.id}`);

    // PR-05.1 AC-02, AC-03: Bifurcation — merchant vs. customer routing
    // Detect if sender is the merchant (by whatsappNumber match)
    if (merchant.whatsappNumber && input.from === merchant.whatsappNumber) {
      return this.handleMerchantAdminMessage(input, merchant.id);
    }

    // PR-05.1 AC-14 (botPaused): if bot is paused, skip processing customer messages
    if (merchant.botPaused) {
      this.logger.log(
        `Bot paused for merchant ${merchant.id} — skipping message from ${this.maskPhone(input.from)}`,
      );
      return {
        response: '',
        shouldSend: false,
        conversationId: '',
        merchantId: merchant.id,
        intent: 'UNKNOWN' as IntentKey,
      };
    }

    // PR-OB-01 AC-09: if merchant is not active (onboarding/paused), reject customer messages
    if (merchant.status !== 'active') {
      this.logger.log(
        `Merchant ${merchant.id} is in '${merchant.status}' status — rejecting message from ${this.maskPhone(input.from)}`,
      );
      return {
        response: 'Tienda en configuración. Por favor intenta más tarde.',
        shouldSend: true,
        conversationId: '',
        merchantId: merchant.id,
        intent: 'UNKNOWN' as IntentKey,
      };
    }

    // 2. Resolve or create customer
    const customer = await this.customerService.resolveByPhone(input.from);
    this.logger.debug(`Customer resolved: ${customer.id}`);

    // 3. Get or create conversation (PR-03.11: include channelId if present)
    const conversation = await this.conversationService.getOrCreateConversation(
      customer.id,
      merchant.id,
      Channel.WHATSAPP,
      input.channelId ?? null, // PR-03.11 AC-11
    );
    this.logger.debug(`Conversation resolved: ${conversation.id}`);

    // PR-05.2 REQ-08, AC-07: Handoff relay — if handoffActive, relay to merchant, skip flows/LLM
    if (conversation.handoffActive) {
      this.logger.log(
        `PR-05.2: handoffActive=true for conversation ${conversation.id}, relaying to merchant`,
      );
      await this.messageRelayService.relayCustomerMessageToMerchant(
        merchant.id,
        customer.id,
        conversation.id,
        input.from,
        input.text,
      );
      return {
        response: '',
        shouldSend: false, // Merchant receives relay, no direct response to customer
        conversationId: conversation.id,
        merchantId: merchant.id,
        intent: 'HANDOFF' as IntentKey,
      };
    }

    // 4. PR-03.10: Log inbound message (REQ-07, AC-07)
    try {
      // AC-06: Use merchant override for message history TTL
      const messageHistoryDays = this.memoryConfigService.getMessageHistoryDays(
        merchant.playbookConfig,
      );
      const expiresAt = new Date(Date.now() + messageHistoryDays * 24 * 60 * 60 * 1000);
      await this.messageLogRepository.create({
        conversationId: conversation.id,
        merchantId: merchant.id,
        direction: MessageDirection.IN,
        providerMessageId: input.messageId,
        text: input.text,
        expiresAt,
      });
      // Note: No logging of text content for PII safety (AC-08)
    } catch (error) {
      // Don't fail orchestration if logging fails
      this.logger.warn(`Failed to log inbound message for conversation ${conversation.id}`, error);
    }

    // 5. PR-05: Check for active checkout state BEFORE intent routing
    // If user is mid-checkout, all messages go to CheckoutFlow regardless of intent
    const activeCheckoutState = await this.checkoutFlow.getActiveState(conversation.id);
    if (activeCheckoutState) {
      this.logger.log(
        `Active checkout state detected (step=${activeCheckoutState.step}), routing to CheckoutFlow`,
      );

      const merchantPlaybookData: MerchantPlaybookData = {
        id: merchant.id,
        name: merchant.name,
        industry: merchant.industry ?? undefined,
        playbookConfig: merchant.playbookConfig as unknown as Record<string, unknown> | null,
      };

      const response = await this.checkoutFlow.handle(
        merchantPlaybookData,
        conversation.id,
        customer.id,
        merchant.id,
        input.text,
      );

      return {
        response,
        shouldSend: true,
        conversationId: conversation.id,
        merchantId: merchant.id,
        intent: 'CHECKOUT',
      };
    }

    // PR-06: Check for active payment fallback state BEFORE intent routing
    const activePaymentFallbackState = await this.paymentFallbackFlow.getActiveState(
      conversation.id,
    );
    if (activePaymentFallbackState) {
      this.logger.log(
        `Active payment fallback state (step=${activePaymentFallbackState.step}), routing to PaymentFallbackFlow`,
      );

      const merchantPlaybookData: MerchantPlaybookData = {
        id: merchant.id,
        name: merchant.name,
        industry: merchant.industry ?? undefined,
        playbookConfig: merchant.playbookConfig as unknown as Record<string, unknown> | null,
      };

      const response = await this.paymentFallbackFlow.handle(
        merchantPlaybookData,
        conversation.id,
        customer.id,
        merchant.id,
        input.text,
      );

      return {
        response,
        shouldSend: true,
        conversationId: conversation.id,
        merchantId: merchant.id,
        intent: 'CONFIRM_PAYMENT',
      };
    }

    // PR-07: Check for active post-sale state BEFORE intent routing
    const activePostSaleState = await this.postSaleFlow.getActiveState(conversation.id);
    if (activePostSaleState) {
      this.logger.log(
        `Active post-sale state (step=${activePostSaleState.step}), routing to PostSaleFlow`,
      );

      const merchantPlaybookData: MerchantPlaybookData = {
        id: merchant.id,
        name: merchant.name,
        industry: merchant.industry ?? undefined,
        playbookConfig: merchant.playbookConfig as unknown as Record<string, unknown> | null,
      };

      const response = await this.postSaleFlow.handle(
        merchantPlaybookData,
        conversation.id,
        customer.id,
        merchant.id,
        input.text,
      );

      const intent =
        activePostSaleState.intent === 'ORDER_STATUS' ? 'ORDER_STATUS' : 'CREATE_TICKET';

      return {
        response,
        shouldSend: true,
        conversationId: conversation.id,
        merchantId: merchant.id,
        intent,
      };
    }

    // PR-04.1 + PR-04.2: Check for active expecting state BEFORE intent routing
    const activeExpecting = await this.expectingService.getExpecting(conversation.id);

    // PR-04.2 REQ-04: cart_management flow pre-check
    if (activeExpecting && activeExpecting.flow === 'cart_management') {
      this.logger.log(
        `cart_management expecting state active (type=${activeExpecting.type}), dispatching to cart handler`,
      );

      const merchantPlaybookData: MerchantPlaybookData = {
        id: merchant.id,
        name: merchant.name,
        industry: merchant.industry ?? undefined,
        playbookConfig: merchant.playbookConfig as unknown as Record<string, unknown> | null,
      };

      const response = await this.handleCartManagementExpecting(
        merchantPlaybookData,
        customer.id,
        merchant.id,
        conversation.id,
        input.text,
        activeExpecting,
      );

      return {
        response,
        shouldSend: true,
        conversationId: conversation.id,
        merchantId: merchant.id,
        intent: 'MANAGE_CART',
      };
    }

    // PR-04.1: search_selection flow pre-check.
    // This handles: ask_search_query, select_product, product_options, view_details.
    if (activeExpecting?.flow === 'search_selection') {
      this.logger.log(
        `Active search_selection state (type=${activeExpecting.type}), routing accordingly`,
      );

      const merchantPlaybookData: MerchantPlaybookData = {
        id: merchant.id,
        name: merchant.name,
        industry: merchant.industry ?? undefined,
        playbookConfig: merchant.playbookConfig as unknown as Record<string, unknown> | null,
      };

      // ask_search_query: any message → treat as search query (REQ-11)
      if (activeExpecting.type === 'ask_search_query') {
        const response = await this.searchCatalogFlow.handleAskSearchQueryReply(
          merchantPlaybookData,
          merchant.id,
          input.text,
          conversation.id,
        );
        await this.conversationService.updateLastIntent(conversation.id, 'SEARCH_PRODUCT');
        return {
          response,
          shouldSend: true,
          conversationId: conversation.id,
          merchantId: merchant.id,
          intent: 'SEARCH_PRODUCT',
        };
      }

      // select_product + "siguiente": pagination (REQ-03)
      const normalizedText = input.text
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (activeExpecting.type === 'select_product' && normalizedText === 'siguiente') {
        const response = await this.searchCatalogFlow.handleNextPage(
          merchantPlaybookData,
          merchant.id,
          conversation.id,
        );
        await this.conversationService.updateLastIntent(conversation.id, 'SEARCH_PRODUCT');
        return {
          response,
          shouldSend: true,
          conversationId: conversation.id,
          merchantId: merchant.id,
          intent: 'SEARCH_PRODUCT',
        };
      }

      // select_product / product_options / view_details: delegate to AddToCartFlow (REQ-04..10)
      if (['select_product', 'product_options', 'view_details'].includes(activeExpecting.type)) {
        // Guard: if message is a new SEARCH_PRODUCT intent, abandon current expecting and re-route
        const SEARCH_KEYWORDS = ['buscar', 'busco', 'tienes', 'hay', 'necesito'];
        const isNewSearchIntent = SEARCH_KEYWORDS.some(
          (kw) => normalizedText === kw || normalizedText.startsWith(kw + ' '),
        );
        if (isNewSearchIntent) {
          await this.expectingService.clearExpecting(conversation.id);
          // Fall through to normal intent classification below
        } else {
          const response = await this.addToCartFlow.handleExpecting(
            merchantPlaybookData,
            customer.id,
            merchant.id,
            conversation.id,
            input.text,
          );
          await this.conversationService.updateLastIntent(conversation.id, 'ADD_TO_CART');
          return {
            response,
            shouldSend: true,
            conversationId: conversation.id,
            merchantId: merchant.id,
            intent: 'ADD_TO_CART',
          };
        }
      }
    }

    // 6. PR-03.5.1: Classify and route (REQ-07, AC-07)
    const classifyStartTime = Date.now();
    const routeDecision = await this.routeDecisionService.classifyAndRoute(input.text, {
      conversationId: conversation.id,
      lastIntent: conversation.lastIntent as IntentKey | undefined,
      merchantId: merchant.id,
    });
    const latencyMs = Date.now() - classifyStartTime;

    // REQ-13, AC-13: Structured logging with all classification metadata
    this.logger.log(
      JSON.stringify({
        intent: routeDecision.intent,
        confidence: routeDecision.confidence,
        signals: routeDecision.signals,
        route: routeDecision.route,
        latencyMs,
      }),
    );

    // PR-11: Build merchant playbook data for downstream components
    const merchantPlaybookData: MerchantPlaybookData = {
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry ?? undefined,
      playbookConfig: merchant.playbookConfig as unknown as Record<string, unknown> | null,
    };

    // PR-08 REQ-04, AC-06: UNKNOWN loop tracking + auto-escalation
    // Counter increments on UNKNOWN, resets on any other intent
    let unknownLoopCount = this.unknownLoopCounters.get(conversation.id) ?? 0;
    if (routeDecision.intent === 'UNKNOWN') {
      unknownLoopCount += 1;
      this.unknownLoopCounters.set(conversation.id, unknownLoopCount);
      this.logger.debug(
        `PR-08: UNKNOWN loop count=${unknownLoopCount} for conversation ${conversation.id}`,
      );
    } else {
      // Reset counter on any resolved intent
      this.unknownLoopCounters.delete(conversation.id);
    }

    // PR-08: Trigger auto-escalation if unknownLoopCount >= 3
    if (
      unknownLoopCount >= 3 &&
      !conversation.handoffActive // Don't escalate if already in handoff
    ) {
      this.logger.log(
        `PR-08: Auto-escalation triggered (${unknownLoopCount} consecutive UNKNOWN) for conversation ${conversation.id}`,
      );
      this.unknownLoopCounters.delete(conversation.id); // reset after escalation
      const escalationResponse = await this.handoffFlow.handle(
        merchantPlaybookData,
        conversation.id,
        customer.id,
        merchant.id,
        'auto_escalation',
      );
      return {
        response: escalationResponse,
        shouldSend: true,
        conversationId: conversation.id,
        merchantId: merchant.id,
        intent: 'HANDOFF' as IntentKey,
      };
    }

    // 6. Execute flow handler based on route type
    let response: string;

    // PR-03.5.1, REQ-08, AC-08: Route-based execution (no binary toggle)
    switch (routeDecision.route) {
      case 'TEMPLATE': {
        // REQ-15, AC-15: Deterministic flows execute without LLM
        const cartAction = this.routeDecisionService.extractCartAction(input.text); // PR-04.2
        response = await this.executeTemplateFlow(
          routeDecision.intent,
          input.text,
          customer.id,
          merchant.id,
          customer.name ?? undefined,
          merchantPlaybookData,
          conversation.id, // PR-05: conversationId for checkout state
          cartAction, // PR-04.2
        );
        break;
      }

      case 'LLM_FALLBACK':
        // REQ-11, AC-11: LLM generates response for UNKNOWN intent
        this.logger.debug('Using LLM fallback for response generation');
        response = await this.llmService.generateConversationalResponse({
          userMessage: input.text,
          merchantId: merchant.id,
          merchant: merchantPlaybookData,
          conversationContext: {
            conversationId: conversation.id,
            merchantName: merchant.name,
            // 'restaurante' (delivery vertical) has no legacy LLM persona → generic
            industry:
              merchant.industry === 'restaurante' ? undefined : (merchant.industry ?? undefined),
          },
        });
        break;

      case 'GENERIC':
        // REQ-12, AC-12: Generic fallback using playbook unknownIntent
        response = this.getUnknownIntentMessage(merchantPlaybookData);
        break;

      default:
        // Type safety: should never reach here
        this.logger.warn(`Unknown route type: ${(routeDecision as { route: string }).route}`);
        response = this.getUnknownIntentMessage(merchantPlaybookData);
        break;
    }

    this.logger.log(`Generated response (${response.length} chars)`);

    // Persist lastIntent for context-aware routing (enables "y camisa blanca" continuations)
    await this.conversationService.updateLastIntent(conversation.id, routeDecision.intent);

    return {
      response,
      shouldSend: true,
      conversationId: conversation.id,
      merchantId: merchant.id,
      intent: routeDecision.intent,
    };
  }

  /**
   * PR-05.1 AC-02: Handle messages from the merchant (admin pipeline)
   * Parses and executes merchant commands, returns response without customer tracking.
   * Creates/resolves a MERCHANT_ADMIN conversation for the merchant's own phone.
   */
  private async handleMerchantAdminMessage(
    input: OrchestratorInput,
    merchantId: string,
  ): Promise<OrchestratorResult> {
    this.logger.log(`PR-05.1: Merchant admin message received for merchant ${merchantId}`);

    // Resolve customer entry for merchant's phone (creates if first time)
    const merchantAsCustomer = await this.customerService.resolveByPhone(input.from);

    // Resolve or create MERCHANT_ADMIN conversation
    const adminConversation = await this.conversationService.getOrCreateConversation(
      merchantAsCustomer.id,
      merchantId,
      Channel.WHATSAPP,
      input.channelId ?? null,
      ConversationType.MERCHANT_ADMIN,
    );

    const parsed = this.merchantCommandParser.parse(input.text);

    let response: string;
    if (!parsed) {
      response = "❌ Comando no reconocido. Escribe 'ayuda' para ver comandos disponibles.";
    } else {
      response = await this.merchantCommandService.executeCommand(merchantId, parsed);
    }

    return {
      response,
      shouldSend: true,
      conversationId: adminConversation.id,
      merchantId,
      intent: 'UNKNOWN' as IntentKey,
    };
  }

  /**
   * PR-03.5.1: Execute template flow based on intent
   * REQ-15, AC-15: These flows NEVER generate LLM calls
   */
  private async executeTemplateFlow(
    intent: IntentKey,
    originalText: string,
    customerId: string,
    merchantId: string,
    customerName: string | undefined,
    merchantPlaybook: MerchantPlaybookData,
    conversationId?: string, // PR-05: needed for checkout state
    cartAction?: { action: 'remove' | 'modify'; index: number } | null, // PR-04.2
  ): Promise<string> {
    switch (intent) {
      case 'GREETING':
        return await this.greetingFlow.handle(customerName, merchantPlaybook);

      case 'HELP':
        return await this.helpFlow.handle(merchantPlaybook);

      case 'SEARCH_PRODUCT':
        return await this.searchCatalogFlow.handle(
          merchantPlaybook,
          merchantId,
          originalText,
          conversationId,
        );

      case 'ADD_TO_CART':
        return await this.addToCartFlow.execute(
          merchantPlaybook,
          customerId,
          merchantId,
          originalText,
          originalText,
        );

      case 'VIEW_CART':
      case 'MANAGE_CART':
        // PR-04.2: Both intents use ViewCartFlow (numbered list + setExpecting)
        if (!conversationId) return this.getUnknownIntentMessage(merchantPlaybook);
        return await this.viewCartFlow.execute(
          merchantPlaybook,
          customerId,
          merchantId,
          conversationId,
        );

      case 'REMOVE_FROM_CART':
        // PR-04.2: If direct action (regex detected), skip to confirm menu
        if (cartAction && conversationId) {
          return await this.removeFromCartFlow.handleDirectAction(
            merchantPlaybook,
            customerId,
            merchantId,
            conversationId,
            cartAction,
          );
        }
        // No direct action and no expecting → show cart list (fallback to MANAGE_CART behavior)
        if (conversationId) {
          return await this.viewCartFlow.execute(
            merchantPlaybook,
            customerId,
            merchantId,
            conversationId,
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'UPDATE_CART':
        // PR-04.2: UPDATE_CART → show cart list for user to select item to modify
        if (conversationId) {
          return await this.viewCartFlow.execute(
            merchantPlaybook,
            customerId,
            merchantId,
            conversationId,
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'QUERY_FAQ':
        // PR-GAP-2 REQ-05, AC-05: Keyword-based FAQ matching (no LLM)
        return (
          this.faqFlow.handle(merchantPlaybook, originalText) ??
          this.getUnknownIntentMessage(merchantPlaybook)
        );

      case 'CHECKOUT':
        // PR-05: Delegate to CheckoutFlow (template-first, no LLM)
        if (conversationId) {
          return await this.checkoutFlow.handle(
            merchantPlaybook,
            conversationId,
            customerId,
            merchantId,
            originalText,
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'CONFIRM_PAYMENT':
        // PR-06: Delegate to PaymentFallbackFlow (template-first, no LLM)
        if (conversationId) {
          return await this.paymentFallbackFlow.handle(
            merchantPlaybook,
            conversationId,
            customerId,
            merchantId,
            originalText,
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'ORDER_STATUS':
        // PR-07: Delegate to PostSaleFlow.handleOrderStatus (template-first, no LLM)
        if (conversationId) {
          return await this.postSaleFlow.handleOrderStatus(
            merchantPlaybook,
            conversationId,
            customerId,
            merchantId,
            originalText,
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'CREATE_TICKET':
        // PR-07: Delegate to PostSaleFlow.handleCreateTicket (template-first, no LLM)
        if (conversationId) {
          return await this.postSaleFlow.handleCreateTicket(
            merchantPlaybook,
            conversationId,
            customerId,
            merchantId,
            originalText,
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'HANDOFF':
        // PR-08 REQ-09, AC-11: Delegate to HandoffFlow (explicit user request)
        if (conversationId) {
          return await this.handoffFlow.handle(
            merchantPlaybook,
            conversationId,
            customerId,
            merchantId,
            'user_request',
          );
        }
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'AMBIGUOUS':
        return this.getUnknownIntentMessage(merchantPlaybook);

      case 'UNKNOWN':
      default:
        // Should not reach here (RouteDecisionService handles UNKNOWN)
        // But keep as safety fallback
        return await this.searchCatalogFlow.handle(
          merchantPlaybook,
          merchantId,
          originalText,
          conversationId,
        );
    }
  }

  /**
   * Get unknownIntent message from merchant's playbook
   * Falls back to generic default if not configured
   */
  private getUnknownIntentMessage(merchantPlaybook: MerchantPlaybookData): string {
    return this.playbookService.getMessage(merchantPlaybook, 'unknownIntent');
  }

  /**
   * Mask phone number for PII protection in logs
   * Example: +573001234567 -> +57300****567
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '****';
    return phone.slice(0, 6) + '****' + phone.slice(-3);
  }

  /**
   * PR-04.2 REQ-04, REQ-05–REQ-09: Handle active cart_management expecting state.
   * Dispatches to RemoveFromCartFlow or UpdateCartItemFlow based on expecting.type.
   */
  private async handleCartManagementExpecting(
    merchantPlaybook: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    messageText: string,
    expecting: import('./types/expecting.types').ExpectingState,
  ): Promise<string> {
    switch (expecting.type) {
      case 'select_action':
        // REQ-05: parse "eliminar N"/"modificar N"/bare-N → confirm menu
        return await this.removeFromCartFlow.handleSelectAction(
          merchantPlaybook,
          customerId,
          merchantId,
          conversationId,
          messageText,
          expecting,
        );

      case 'confirm_action': {
        // REQ-06, REQ-07, REQ-08: option 1=remove, 2=modify qty, 3=cancel
        const option = parseNumericSelection(messageText, 3);
        const cartItems = expecting.data.cartItems ?? [];
        const selectedIdx = expecting.data.selectedItemIndex;
        const pendingAction = expecting.data.pendingAction;

        if (option === null) {
          return this.playbookService.getMessage(merchantPlaybook, 'cartItemNotFound');
        }

        if (option === 3) {
          // AC-08: Cancel
          return await this.removeFromCartFlow.handleCancel(merchantPlaybook, conversationId);
        }

        if (!selectedIdx || selectedIdx < 1 || selectedIdx > cartItems.length) {
          await this.expectingService.clearExpecting(conversationId);
          return this.playbookService.getMessage(merchantPlaybook, 'cartItemNotFound');
        }

        const selectedItem = cartItems[selectedIdx - 1];

        if (option === 1 && pendingAction === 'remove') {
          // AC-06: Confirm remove
          return await this.removeFromCartFlow.handleConfirmRemove(
            merchantPlaybook,
            customerId,
            merchantId,
            conversationId,
            selectedItem.id,
            selectedItem.name,
          );
        }

        if (option === 1 && pendingAction === 'modify') {
          // option=1 with modify pending means confirm modification → ask quantity
          const stock = await this.safeGetVariantStock(selectedItem.id);
          return await this.updateCartItemFlow.handleAskQuantity(
            merchantPlaybook,
            conversationId,
            { id: selectedItem.id, name: selectedItem.name },
            selectedItem.qty,
            stock,
          );
        }

        if (option === 2) {
          // AC-07: Ask quantity (regardless of pendingAction)
          const stock = await this.safeGetVariantStock(selectedItem.id);
          return await this.updateCartItemFlow.handleAskQuantity(
            merchantPlaybook,
            conversationId,
            { id: selectedItem.id, name: selectedItem.name },
            selectedItem.qty,
            stock,
          );
        }

        // Fallback: unknown option
        return this.playbookService.getMessage(merchantPlaybook, 'cartItemNotFound');
      }

      case 'select_quantity':
        // REQ-09: validate qty → update → clearExpecting
        return await this.updateCartItemFlow.handleSelectQuantity(
          merchantPlaybook,
          customerId,
          merchantId,
          conversationId,
          messageText,
          expecting,
        );

      default:
        await this.expectingService.clearExpecting(conversationId);
        return this.getUnknownIntentMessage(merchantPlaybook);
    }
  }

  /**
   * PR-04.2: Safely get variant stock for a cart item.
   * Falls back to 99 (generous upper bound) if lookup fails.
   */
  private async safeGetVariantStock(itemId: string): Promise<number> {
    try {
      return await this.cartService.getVariantStockForItem(itemId);
    } catch {
      this.logger.warn(`safeGetVariantStock: failed for itemId=${itemId}, using 99 as fallback`);
      return 99;
    }
  }
}
