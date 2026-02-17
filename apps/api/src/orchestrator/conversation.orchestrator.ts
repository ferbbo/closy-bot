import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntentRouterService, IntentType } from './intent/intent-router.service';
import { CustomerService } from '../services/customer.service';
import { ConversationService } from '../services/conversation.service';
import { MerchantResolverService } from '../services/merchant-resolver.service';
import type { MerchantPlaybookData } from '../services/playbook.service';
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { LlmService } from '../llm/llm.service';

export interface OrchestratorInput {
  messageId: string;
  from: string; // sender phone
  receiverPhoneId: string; // WhatsApp phone number ID
  text: string;
  timestamp: Date;
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
 * 4. Classify intent
 * 5. Execute flow (using LLM if enabled, or templated flow)
 * 6. Return response
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
    private readonly llmService: LlmService,
  ) {
    this.llmEnabled = this.configService.get<boolean>('LLM_ENABLED', false);
  }

  /**
   * Process inbound message and generate response
   *
   * @param input - OrchestratorInput with message details
   * @returns OrchestratorResult with response and metadata
   */
  async process(input: OrchestratorInput): Promise<OrchestratorResult> {
    const maskedPhone = this.maskPhone(input.from);
    this.logger.log(`Processing message ${input.messageId} from ${maskedPhone}`);

    // 1. Resolve merchant
    const merchant = await this.merchantResolver.resolveByWhatsAppPhoneId(input.receiverPhoneId);
    this.logger.debug(`Merchant resolved: ${merchant.id}`);

    // 2. Resolve or create customer
    const customer = await this.customerService.resolveByPhone(input.from);
    this.logger.debug(`Customer resolved: ${customer.id}`);

    // 3. Get or create conversation
    const conversation = await this.conversationService.getOrCreateConversation(
      customer.id,
      merchant.id,
      'whatsapp',
    );
    this.logger.debug(`Conversation resolved: ${conversation.id}`);

    // 4. Classify intent
    const intentResult = this.intentRouter.classify(input.text);
    this.logger.log(
      `Intent classified: ${intentResult.intent} (confidence: ${intentResult.confidence})`,
    );

    // 5. Execute flow handler
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
