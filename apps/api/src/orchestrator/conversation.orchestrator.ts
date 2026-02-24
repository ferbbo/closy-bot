import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageDirection, ChannelType } from '@prisma/client'; // PR-03.10, PR-03.11
import { IntentRouterService, IntentType } from './intent/intent-router.service';
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
  intent: IntentType;
}

/**
 * ConversationOrchestrator
 * Main orchestration service that coordinates the conversation pipeline:
 * 1. Resolve merchant
 * 2. Resolve/create customer
 * 3. Resolve/create conversation
 * 4. PR-03.10: Log inbound message (REQ-07, AC-07)
 * 5. Classify intent
 * 6. Execute flow (using LLM if enabled, or templated flow)
 * 7. Return response
 */
@Injectable()
export class ConversationOrchestrator {
  private readonly logger = new Logger(ConversationOrchestrator.name);
  private readonly llmEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly merchantResolver: MerchantResolverService,
    private readonly customerService: CustomerService,
    private readonly conversationService: ConversationService,
    private readonly intentRouter: IntentRouterService,
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
    this.llmEnabled = this.configService.get<boolean>('LLM_ENABLED', false);
  }

  /**
   * Process inbound message and generate response
   * PR-03.11: Supports pre-resolved merchantId+channelId for multi-channel routing
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

    // 5. Classify intent
    const intentResult = this.intentRouter.classify(input.text);
    this.logger.log(
      `Intent classified: ${intentResult.intent} (confidence: ${intentResult.confidence})`,
    );

    // 6. Execute flow handler
    let response: string;

    // PR-11: Build merchant playbook data for downstream components
    const merchantPlaybookData: MerchantPlaybookData = {
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry ?? undefined,
      playbookConfig: merchant.playbookConfig,
    };

    // If LLM is enabled, use it for all intents (except explicit flows like search)
    if (this.llmEnabled) {
      this.logger.debug('Using LLM for response generation');
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
    } else {
      // Fallback to templated flow handlers
      switch (intentResult.intent) {
        case 'GREETING':
          response = await this.greetingFlow.handle(
            customer.name ?? undefined,
            merchantPlaybookData,
          );
          break;

        case 'HELP':
          response = await this.helpFlow.handle();
          break;

        case 'SEARCH_PRODUCT':
          const query = intentResult.entities?.query || input.text;
          response = await this.searchCatalogFlow.handle(merchant.id, query);
          break;

        // PR-04: Cart intents (AC-07, AC-08, AC-09, AC-10)
        case 'ADD_TO_CART':
          const productQuery = intentResult.entities?.productName || input.text;
          response = await this.addToCartFlow.execute(
            customer.id,
            merchant.id,
            productQuery,
            input.text,
          );
          break;

        case 'VIEW_CART':
          response = await this.viewCartFlow.execute(customer.id, merchant.id);
          break;

        case 'REMOVE_FROM_CART':
          const removeQuery = intentResult.entities?.productName || input.text;
          response = await this.removeFromCartFlow.execute(customer.id, merchant.id, removeQuery);
          break;

        case 'UPDATE_CART':
          const updateQuery = intentResult.entities?.productName || input.text;
          // Extract quantity from text (e.g., "cambiar a 3", "poner 5", "actualizar a 2")
          const quantityMatch = input.text.match(/\b(\d+)\b/);
          const newQuantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;
          response = await this.updateCartItemFlow.execute(
            customer.id,
            merchant.id,
            updateQuery,
            newQuantity,
          );
          break;

        case 'UNKNOWN':
        default:
          // For unknown intent, try search as fallback
          const fallbackQuery = intentResult.entities?.query || input.text;
          response = await this.searchCatalogFlow.handle(merchant.id, fallbackQuery);
          break;
      }
    }

    this.logger.log(`Generated response (${response.length} chars)`);

    return {
      response,
      shouldSend: true,
      conversationId: conversation.id,
      merchantId: merchant.id,
      intent: intentResult.intent,
    };
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
