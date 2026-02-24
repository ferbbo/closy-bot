import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageDirection, ChannelType } from '@prisma/client'; // PR-03.10, PR-03.11
import type { IntentKey } from './types/intent.types'; // PR-03.5.1
import { RouteDecisionService } from './route-decision.service'; // PR-03.5.1
import { CustomerService } from '../services/customer.service';
import { ConversationService } from '../services/conversation.service';
import { MerchantResolverService } from '../services/merchant-resolver.service';
import type { MerchantPlaybookData } from '../services/playbook.service';
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { AddToCartFlow } from './flows/add-to-cart.flow'; // PR-04 AC-07
import { ViewCartFlow } from './flows/view-cart.flow'; // PR-04 AC-08
import { UpdateCartItemFlow } from './flows/update-cart-item.flow'; // PR-04 AC-09
import { RemoveFromCartFlow } from './flows/remove-from-cart.flow'; // PR-04 AC-10
import { LlmService } from '../llm/llm.service';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository'; // PR-03.10
import { MemoryConfigService } from '../common/config/memory-config.service'; // PR-03.10 AC-06

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
    private readonly llmService: LlmService,
    private readonly messageLogRepository: MessageLogRepository, // PR-03.10
    private readonly memoryConfigService: MemoryConfigService, // PR-03.10 AC-06
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

    // 2. Resolve or create customer
    const customer = await this.customerService.resolveByPhone(input.from);
    this.logger.debug(`Customer resolved: ${customer.id}`);

    // 3. Get or create conversation (PR-03.11: include channelId if present)
    const conversation = await this.conversationService.getOrCreateConversation(
      customer.id,
      merchant.id,
      'whatsapp',
      input.channelId ?? null, // PR-03.11 AC-11
    );
    this.logger.debug(`Conversation resolved: ${conversation.id}`);

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

    // 5. PR-03.5.1: Classify and route (REQ-07, AC-07)
    const classifyStartTime = Date.now();
    const routeDecision = await this.routeDecisionService.classifyAndRoute(input.text, {
      conversationId: conversation.id,
      lastIntent: conversation.memory?.lastIntent as IntentKey | undefined,
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

    // 6. Execute flow handler based on route type
    let response: string;

    // PR-11: Build merchant playbook data for downstream components
    const merchantPlaybookData: MerchantPlaybookData = {
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry ?? undefined,
      playbookConfig: merchant.playbookConfig,
    };

    // PR-03.5.1, REQ-08, AC-08: Route-based execution (no binary toggle)
    switch (routeDecision.route) {
      case 'TEMPLATE':
        // REQ-15, AC-15: Deterministic flows execute without LLM
        response = await this.executeTemplateFlow(
          routeDecision.intent,
          input.text,
          customer.id,
          merchant.id,
          customer.name ?? undefined,
          merchantPlaybookData,
        );
        break;

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
            industry: merchant.industry ?? undefined,
          },
        });
        break;

      case 'GENERIC':
        // REQ-12, AC-12: Generic fallback (hardcoded message)
        response = this.getGenericFallbackMessage();
        break;

      default:
        // Type safety: should never reach here
        this.logger.warn(`Unknown route type: ${(routeDecision as { route: string }).route}`);
        response = this.getGenericFallbackMessage();
        break;
    }

    this.logger.log(`Generated response (${response.length} chars)`);

    return {
      response,
      shouldSend: true,
      conversationId: conversation.id,
      merchantId: merchant.id,
      intent: routeDecision.intent,
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
  ): Promise<string> {
    switch (intent) {
      case 'GREETING':
        return await this.greetingFlow.handle(customerName, merchantPlaybook);

      case 'HELP':
        return await this.helpFlow.handle();

      case 'SEARCH_PRODUCT':
        return await this.searchCatalogFlow.handle(merchantId, originalText);

      case 'ADD_TO_CART':
        return await this.addToCartFlow.execute(customerId, merchantId, originalText, originalText);

      case 'VIEW_CART':
        return await this.viewCartFlow.execute(customerId, merchantId);

      case 'REMOVE_FROM_CART':
        return await this.removeFromCartFlow.execute(customerId, merchantId, originalText);

      case 'UPDATE_CART':
        // Extract quantity from text (e.g., "cambiar a 3", "poner 5", "actualizar a 2")
        const quantityMatch = originalText.match(/\b(\d+)\b/);
        const newQuantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;
        return await this.updateCartItemFlow.execute(
          customerId,
          merchantId,
          originalText,
          newQuantity,
        );

      case 'CHECKOUT':
      case 'QUERY_FAQ':
      case 'HANDOFF':
      case 'AMBIGUOUS':
        // These are not yet implemented but have templates routes
        return this.getGenericFallbackMessage();

      case 'UNKNOWN':
      default:
        // Should not reach here (RouteDecisionService handles UNKNOWN)
        // But keep as safety fallback
        return await this.searchCatalogFlow.handle(merchantId, originalText);
    }
  }

  /**
   * REQ-12, AC-12: Generic fallback message (no LLM)
   */
  private getGenericFallbackMessage(): string {
    return "No entendí, escribe 'ayuda'";
  }

  /**
   * Mask phone number for PII protection in logs
   * Example: +573001234567 -> +57300****567
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '****';
    return phone.slice(0, 6) + '****' + phone.slice(-3);
  }
}
