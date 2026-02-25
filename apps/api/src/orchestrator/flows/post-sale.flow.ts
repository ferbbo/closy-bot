/**
 * PostSaleFlow
 * PR-07: Post-sale — order status + ticket creation
 *
 * REQ-05, REQ-06: Template-first (no LLM). State persisted in Conversation.metadata.post_sale
 *
 * AC-05: Response uses template per order.status
 * AC-06: No-order case → noOrderFound template
 * AC-07: Shipped order with trackingInfo
 * AC-08: Ticket type classification by keywords
 * AC-09: Merchant notified via MerchantNotificationService
 * AC-14: OutboxMessage enqueued for merchant notification
 */

import { Injectable, Logger } from '@nestjs/common';
import { TicketType } from '@prisma/client';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { PostSaleService } from '../../services/post-sale.service';
import { MerchantNotificationService } from '../../services/merchant-notification.service';
import { PlaybookService } from '../../services/playbook.service';
import type { MerchantPlaybookData } from '../../services/playbook.service';

// ---------------------------------------------------------------------------
// PostSale conversation state — persisted in Conversation.metadata.post_sale
// ---------------------------------------------------------------------------
export interface PostSaleState {
  step:
    | 'ASK_ORDER_CODE_FOR_STATUS' // Ask customer which order to check
    | 'ASK_ORDER_CODE_FOR_TICKET' // Ask customer which order has a problem
    | 'ASK_TICKET_TYPE' // Ask (1-4) for type selection
    | 'ASK_TICKET_DESCRIPTION' // Ask for problem description
    | 'COMPLETED';
  intent: 'ORDER_STATUS' | 'CREATE_TICKET';
  orderId?: string;
  orderCode?: string;
  ticketType?: TicketType;
  startedAt: string;
}

@Injectable()
export class PostSaleFlow {
  private readonly logger = new Logger(PostSaleFlow.name);

  // Mapping choice 1-4 to TicketType
  private static readonly TICKET_TYPE_MAP: Record<string, TicketType> = {
    '1': 'missing',
    '2': 'damaged',
    '3': 'delay',
    '4': 'other',
    falta: 'missing',
    dañado: 'damaged',
    danado: 'damaged',
    roto: 'damaged',
    demora: 'delay',
    retraso: 'delay',
    otro: 'other',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly postSaleService: PostSaleService,
    private readonly merchantNotificationService: MerchantNotificationService,
    private readonly playbookService: PlaybookService,
  ) {}

  // ---------------------------------------------------------------------------
  // getActiveState — intercept mid-flow messages (used by orchestrator)
  // ---------------------------------------------------------------------------
  async getActiveState(conversationId: string): Promise<PostSaleState | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    if (!conversation?.metadata) return null;
    const meta = conversation.metadata as Record<string, unknown>;
    const state = meta['post_sale'] as PostSaleState | undefined;
    if (!state || state.step === 'COMPLETED') return null;
    return state;
  }

  // ---------------------------------------------------------------------------
  // handleOrderStatus — entry point for ORDER_STATUS intent
  // AC-05, AC-06, AC-07
  // ---------------------------------------------------------------------------
  async handleOrderStatus(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
  ): Promise<string> {
    this.logger.log(`PostSaleFlow.handleOrderStatus: conversation=${conversationId}`);

    // Extract orderCode if present in message (e.g. "estado de ORD-001")
    const mentionedCode = this.extractOrderCode(messageText);

    const result = await this.postSaleService.getOrderStatus(
      merchantId,
      customerId,
      merchant,
      mentionedCode ?? undefined,
    );

    if (!result.found) {
      // AC-06: No orders found — save state to accept orderCode from next message
      await this.saveState(conversationId, {
        step: 'ASK_ORDER_CODE_FOR_STATUS',
        intent: 'ORDER_STATUS',
        startedAt: new Date().toISOString(),
      });
      return result.message; // noOrderFound template
    }

    // AC-05, AC-07: Found → respond with template
    await this.clearState(conversationId);
    return result.message;
  }

  // ---------------------------------------------------------------------------
  // handleCreateTicket — entry point for CREATE_TICKET intent
  // AC-08, AC-09
  // ---------------------------------------------------------------------------
  async handleCreateTicket(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
  ): Promise<string> {
    this.logger.log(`PostSaleFlow.handleCreateTicket: conversation=${conversationId}`);

    // Try to detect ticket type from the original message
    const detectedType = this.postSaleService.detectTicketType(messageText);
    const mentionedCode = this.extractOrderCode(messageText);

    // Find last order for customer (to associate ticket)
    const lastOrder = mentionedCode
      ? await this.postSaleService.findOrderByCode(merchantId, customerId, mentionedCode)
      : await this.findLastOrder(merchantId, customerId);

    if (!lastOrder) {
      // No order found — ask for orderCode first
      await this.saveState(conversationId, {
        step: 'ASK_ORDER_CODE_FOR_TICKET',
        intent: 'CREATE_TICKET',
        startedAt: new Date().toISOString(),
      });
      return this.playbookService.getMessage(merchant, 'noOrderFound');
    }

    if (detectedType) {
      // AC-08: type detected from keywords — go directly to description
      await this.saveState(conversationId, {
        step: 'ASK_TICKET_DESCRIPTION',
        intent: 'CREATE_TICKET',
        orderId: lastOrder.id,
        orderCode: lastOrder.orderCode,
        ticketType: detectedType,
        startedAt: new Date().toISOString(),
      });
      return this.playbookService.getMessage(merchant, 'ticketDescriptionPrompt');
    }

    // Ambiguous — ask for type
    await this.saveState(conversationId, {
      step: 'ASK_TICKET_TYPE',
      intent: 'CREATE_TICKET',
      orderId: lastOrder.id,
      orderCode: lastOrder.orderCode,
      startedAt: new Date().toISOString(),
    });
    return this.playbookService.getMessage(merchant, 'ticketTypePrompt');
  }

  // ---------------------------------------------------------------------------
  // handle — main entry point (called by orchestrator for mid-flow messages)
  // ---------------------------------------------------------------------------
  async handle(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
  ): Promise<string> {
    const state = await this.getActiveState(conversationId);

    if (!state) {
      // Should not reach here normally (orchestrator checks first)
      return "No entendí, escribe 'ayuda'";
    }

    switch (state.step) {
      case 'ASK_ORDER_CODE_FOR_STATUS':
        return this.handleAskOrderCodeForStatus(
          merchant,
          conversationId,
          customerId,
          merchantId,
          messageText,
        );

      case 'ASK_ORDER_CODE_FOR_TICKET':
        return this.handleAskOrderCodeForTicket(
          merchant,
          conversationId,
          customerId,
          merchantId,
          messageText,
        );

      case 'ASK_TICKET_TYPE':
        return this.handleAskTicketType(merchant, conversationId, messageText, state);

      case 'ASK_TICKET_DESCRIPTION':
        return this.handleAskTicketDescription(
          merchant,
          conversationId,
          customerId,
          merchantId,
          messageText,
          state,
        );

      default:
        await this.clearState(conversationId);
        return "No entendí, escribe 'ayuda'";
    }
  }

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  private async handleAskOrderCodeForStatus(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
  ): Promise<string> {
    const orderCode = messageText.trim().toUpperCase();
    const result = await this.postSaleService.getOrderStatus(
      merchantId,
      customerId,
      merchant,
      orderCode,
    );

    if (!result.found) {
      // Still not found — keep same state
      return result.message;
    }

    await this.clearState(conversationId);
    return result.message;
  }

  private async handleAskOrderCodeForTicket(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
  ): Promise<string> {
    const orderCode = this.extractOrderCode(messageText) ?? messageText.trim().toUpperCase();
    const order = await this.postSaleService.findOrderByCode(merchantId, customerId, orderCode);

    if (!order) {
      return this.playbookService.getMessage(merchant, 'noOrderFound');
    }

    // Order found — ask for ticket type
    await this.saveState(conversationId, {
      step: 'ASK_TICKET_TYPE',
      intent: 'CREATE_TICKET',
      orderId: order.id,
      orderCode: order.orderCode,
      startedAt: new Date().toISOString(),
    });
    return this.playbookService.getMessage(merchant, 'ticketTypePrompt');
  }

  private async handleAskTicketType(
    merchant: MerchantPlaybookData,
    conversationId: string,
    messageText: string,
    state: PostSaleState,
  ): Promise<string> {
    const normalized = messageText
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    const ticketType = PostSaleFlow.TICKET_TYPE_MAP[normalized] ?? null;

    if (!ticketType) {
      // Re-prompt
      return this.playbookService.getMessage(merchant, 'ticketTypePrompt');
    }

    // Update state → ASK_TICKET_DESCRIPTION
    await this.saveState(conversationId, {
      ...state,
      step: 'ASK_TICKET_DESCRIPTION',
      ticketType,
    });
    return this.playbookService.getMessage(merchant, 'ticketDescriptionPrompt');
  }

  private async handleAskTicketDescription(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
    state: PostSaleState,
  ): Promise<string> {
    const description = messageText.trim();

    if (description.length < 3) {
      // Too short — re-prompt
      return this.playbookService.getMessage(merchant, 'ticketDescriptionPrompt');
    }

    const ticketType = state.ticketType ?? 'other';
    const orderId = state.orderId!;
    const orderCode = state.orderCode!;

    // AC-04: Create ticket with status 'open'
    const result = await this.postSaleService.createTicket(
      orderId,
      customerId,
      merchantId,
      ticketType,
      description,
    );

    // AC-09: Notify merchant via MerchantNotificationService
    // NOTE: description is NOT logged at INFO level (PII guardrail)
    await this.notifyMerchantNewTicket(merchantId, orderCode, ticketType, customerId);

    await this.clearState(conversationId);

    return this.playbookService.getMessage(merchant, 'ticketCreatedConfirm', {
      ticketId: result.ticketId,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async notifyMerchantNewTicket(
    merchantId: string,
    orderCode: string,
    type: TicketType,
    customerId: string,
  ): Promise<void> {
    try {
      // Resolve customer name for notification
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { name: true, phone: true },
      });

      const customerLabel = customer?.name ?? customer?.phone ?? customerId;

      // AC-14: Use notifyTicketCreated (addded via notifyGeneric pattern)
      await this.merchantNotificationService.notifyTicketCreated(merchantId, {
        orderCode,
        type,
        customerName: customerLabel,
      });
    } catch (error) {
      // Don't fail the ticket creation if notification fails
      this.logger.warn(`Failed to notify merchant ${merchantId} for ticket: ${error}`);
    }
  }

  private async findLastOrder(
    merchantId: string,
    customerId: string,
  ): Promise<{ id: string; orderCode: string } | null> {
    return this.prisma.order.findFirst({
      where: { merchantId, customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderCode: true },
    });
  }

  private extractOrderCode(text: string): string | null {
    // Match patterns like ORD-001, ORD-123, etc.
    const match = text.toUpperCase().match(/\b([A-Z]{2,5}-\d{3,6})\b/);
    return match ? match[1] : null;
  }

  private async saveState(conversationId: string, state: PostSaleState): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const existing = (conversation?.metadata as Record<string, unknown>) ?? {};
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: { ...existing, post_sale: state },
      },
    });
  }

  private async clearState(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const existing = (conversation?.metadata as Record<string, unknown>) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { post_sale: _removed, ...rest } = existing;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { metadata: rest },
    });
  }
}
