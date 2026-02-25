import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationType,
  MessageDirection,
  OutboxChannel,
  OutboxMessageType,
} from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { ConversationRepository } from '../persistence/repositories/conversation.repository';
import { MessageLogRepository } from '../persistence/repositories/message-log.repository';

/**
 * MessageRelayService
 * PR-05.2 — REQ-04..REQ-11
 *
 * Relay bidireccional merchant ↔ cliente vía OutboxMessage.
 * - sendMessageToCustomer: merchant envía ad-hoc al cliente (comando `msg`)
 * - sendMessageToMerchant: relay de respuesta de cliente al merchant (handoff activo)
 * - activateHandoff:       cliente → flagear Conversation.handoffActive = true
 * - deactivateHandoff:     cerrar handoff activo del merchant
 *
 * Mensajes relayed se log con source = 'relay' (AC-10).
 */
@Injectable()
export class MessageRelayService {
  private readonly logger = new Logger(MessageRelayService.name);

  // TTL para MessageLog de mensajes relay (30 días)
  private readonly LOG_TTL_DAYS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageLogRepository: MessageLogRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // AC-08: formato mensaje → cliente
  // ---------------------------------------------------------------------------
  formatMessageForCustomer(merchantName: string, text: string): string {
    return `Mensaje de ${merchantName}: ${text}`;
  }

  // ---------------------------------------------------------------------------
  // AC-09: formato mensaje → merchant
  // ---------------------------------------------------------------------------
  formatMessageForMerchant(orderCode: string, text: string): string {
    return `Cliente ${orderCode} dice: ${text}`;
  }

  // ---------------------------------------------------------------------------
  // AC-04, AC-08: Comando `msg <orderCode> <texto>` — merchant → cliente
  // REQ-05
  // ---------------------------------------------------------------------------
  async sendMessageToCustomer(
    merchantId: string,
    orderCode: string,
    text: string,
  ): Promise<string> {
    const order = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { name: true, whatsappNumber: true },
    });

    // Edge case: merchant self-messaging (REQ-05)
    if (merchant?.whatsappNumber && order.customerPhone === merchant.whatsappNumber) {
      return `❌ No puedes enviarte mensajes a ti mismo`;
    }

    const merchantName = merchant?.name ?? 'El comercio';
    const formatted = this.formatMessageForCustomer(merchantName, text);

    // Enqueue OutboxMessage (REQ-05)
    const dedupeKey = `relay-to-customer-${orderCode}-${merchantId}-${Date.now()}`;
    await this.outboxRepository.create({
      merchant: { connect: { id: merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to: order.customerPhone,
      payloadJson: { text: formatted },
      dedupeKey,
    });

    // AC-10: log con source = 'relay'
    const conv = await this.conversationRepository.findByCustomerAndChannel(
      order.customerId,
      merchantId,
      'whatsapp',
      undefined,
      ConversationType.CUSTOMER,
    );
    if (conv) {
      await this.logRelayMessage(conv.id, merchantId, MessageDirection.OUT, formatted);
    }

    this.logger.log(
      `PR-05.2 AC-04: Message relayed to customer for order ${orderCode} (merchant ${merchantId})`,
    );
    return `✅ Mensaje enviado a cliente de ${orderCode}`;
  }

  // ---------------------------------------------------------------------------
  // AC-07, AC-09: Relay cliente → merchant (handoff activo)
  // REQ-08
  // ---------------------------------------------------------------------------
  async sendMessageToMerchant(
    merchantId: string,
    orderCode: string,
    customerText: string,
    conversationId: string,
    merchantId_for_log?: string,
  ): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { whatsappNumber: true },
    });

    if (!merchant?.whatsappNumber) {
      this.logger.warn(
        `PR-05.2: Merchant ${merchantId} has no whatsappNumber, cannot relay message`,
      );
      return;
    }

    const formatted = this.formatMessageForMerchant(orderCode, customerText);

    const dedupeKey = `relay-to-merchant-${merchantId}-${conversationId}-${Date.now()}`;
    await this.outboxRepository.create({
      merchant: { connect: { id: merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to: merchant.whatsappNumber,
      payloadJson: { text: formatted },
      dedupeKey,
    });

    // AC-10: log con source = 'relay'
    await this.logRelayMessage(
      conversationId,
      merchantId_for_log ?? merchantId,
      MessageDirection.IN,
      customerText,
    );

    this.logger.log(
      `PR-05.2 AC-07: Customer message relayed to merchant ${merchantId} (order ${orderCode})`,
    );
  }

  // ---------------------------------------------------------------------------
  // AC-05: Comando `handoff <orderCode>` — activar relay bidireccional
  // REQ-06
  // ---------------------------------------------------------------------------
  async activateHandoff(merchantId: string, orderCode: string): Promise<string> {
    const order = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    const conversation = await this.conversationRepository.findByCustomerAndChannel(
      order.customerId,
      merchantId,
      'whatsapp',
      undefined,
      ConversationType.CUSTOMER,
    );

    if (!conversation) {
      return `❌ No se encontró conversación activa para el pedido ${orderCode}`;
    }

    // Idempotente: setear true múltiples veces es seguro
    await this.conversationRepository.updateHandoffActive(conversation.id, true);

    this.logger.log(
      `PR-05.2 AC-05: Handoff activated for order ${orderCode}, conversation ${conversation.id}`,
    );
    return `✅ Handoff activo para ${orderCode}. Mensajes del cliente te llegarán directamente.`;
  }

  // ---------------------------------------------------------------------------
  // AC-06: Comando `cerrar handoff` — desactivar relay
  // REQ-07
  // ---------------------------------------------------------------------------
  async deactivateHandoff(merchantId: string): Promise<string> {
    const conversation = await this.conversationRepository.findActiveHandoffByMerchant(merchantId);

    if (!conversation) {
      return `ℹ️ No hay handoff activo en este momento`;
    }

    // Idempotente: setear false múltiples veces es seguro
    await this.conversationRepository.updateHandoffActive(conversation.id, false);

    this.logger.log(
      `PR-05.2 AC-06: Handoff deactivated for merchant ${merchantId}, conversation ${conversation.id}`,
    );
    return `✅ Handoff cerrado. El bot retomará conversación con el cliente.`;
  }

  // ---------------------------------------------------------------------------
  // Relay from orchestrator when handoffActive = true
  // Finds the most recent order of the customer to get orderCode for formatting
  // REQ-08, AC-07
  // ---------------------------------------------------------------------------
  async relayCustomerMessageToMerchant(
    merchantId: string,
    customerId: string,
    conversationId: string,
    customerPhone: string,
    text: string,
  ): Promise<void> {
    // Skip empty messages (edge case from brief)
    if (!text || !text.trim()) {
      return;
    }

    // Find last order for this customer+merchant to get orderCode
    const lastOrder = await this.prisma.order.findFirst({
      where: { customerId, merchantId },
      orderBy: { createdAt: 'desc' },
      select: { orderCode: true },
    });

    const orderCode = lastOrder?.orderCode ?? customerPhone;

    await this.sendMessageToMerchant(merchantId, orderCode, text, conversationId, merchantId);
  }

  // ---------------------------------------------------------------------------
  // Private: log relay message  (AC-10)
  // ---------------------------------------------------------------------------
  private async logRelayMessage(
    conversationId: string,
    merchantId: string,
    direction: MessageDirection,
    text: string,
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.LOG_TTL_DAYS * 24 * 60 * 60 * 1000);
      await this.messageLogRepository.create({
        conversationId,
        merchantId,
        direction,
        text,
        source: 'relay', // AC-10: marcar como relay
        expiresAt,
      });
    } catch (err) {
      this.logger.warn(
        `PR-05.2: Failed to log relay message for conversation ${conversationId}`,
        err,
      );
    }
  }
}
