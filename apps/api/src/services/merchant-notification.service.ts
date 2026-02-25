import { Injectable, Logger } from '@nestjs/common';
import { OutboxChannel, OutboxMessageType } from '@prisma/client';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { PrismaService } from '../persistence/prisma/prisma.service';

// ---------------------------------------------------------------------------
// MerchantNotificationPayload — internal type for order notifications
// REQ-10, AC-11
// ---------------------------------------------------------------------------
export interface MerchantNotificationPayload {
  type: 'NEW_ORDER';
  orderCode: string;
  customerName: string;
  totalAmount: string; // formatted e.g. "$120,000"
  items: Array<{ name: string; qty: number; price: string }>;
  shippingAddress: string;
  paymentMethod: string;
}

// ---------------------------------------------------------------------------
// MerchantPaymentNotification — internal type for payment notifications
// PR-06 REQ-09, AC-12
// ---------------------------------------------------------------------------
export interface MerchantPaymentNotificationPayload {
  type: 'PAYMENT_CONFIRMED';
  orderCode: string;
  amount: string; // formatted e.g. "$120,000 COP"
  method: string;
  timestamp: string; // ISO
  isManual?: boolean;
}

/**
 * MerchantNotificationService
 * PR-05: Checkout Order Creation — REQ-10, AC-11
 *
 * Enqueues an OutboxMessage to send a WhatsApp notification to the merchant
 * when a new order is created.
 *
 * Uses the transactional outbox pattern (PR-03.9) — no direct API calls.
 * AC-11: Handles null merchant.phone gracefully (log + skip, order still created).
 */
@Injectable()
export class MerchantNotificationService {
  private readonly logger = new Logger(MerchantNotificationService.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * AC-11: Enqueue WhatsApp notification to merchant with order details.
   * Idempotent via dedupeKey = `new-order-${orderCode}-${merchantId}`.
   * If merchant.phone is null → log warning and skip (do NOT crash).
   */
  async notifyNewOrder(merchantId: string, payload: MerchantNotificationPayload): Promise<void> {
    // Resolve merchant phone
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, whatsappNumber: true },
    });

    if (!merchant) {
      this.logger.warn(`MerchantNotification: merchant ${merchantId} not found — skipping`);
      return;
    }

    if (!merchant.whatsappNumber) {
      this.logger.warn(
        `MerchantNotification: merchant ${merchantId} has no whatsappNumber — skipping`,
      );
      return;
    }

    const message = this.formatMessage(payload);
    const dedupeKey = `new-order-${payload.orderCode}-${merchantId}`;

    await this.outboxRepository.create({
      merchant: { connect: { id: merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to: merchant.whatsappNumber,
      payloadJson: { text: message },
      dedupeKey,
    });

    this.logger.log(`Notification enqueued for merchant ${merchantId}: order ${payload.orderCode}`);
  }

  /**
   * Format the notification message for the merchant.
   * AC-11: Message includes orderCode, customer, total, items, address, payment
   */
  formatMessage(payload: MerchantNotificationPayload): string {
    const itemLines = payload.items.map((i) => `  - ${i.name} x${i.qty}: ${i.price}`).join('\n');

    return (
      `🔔 Nuevo pedido ${payload.orderCode}\n` +
      `👤 ${payload.customerName}\n` +
      `📍 ${payload.shippingAddress}\n` +
      `💵 Total: ${payload.totalAmount}\n` +
      `💳 ${payload.paymentMethod}\n` +
      `\nItems:\n${itemLines}`
    );
  }

  /**
   * Format amount for display (e.g. 120000 → "$120,000 COP")
   */
  formatAmount(amount: number, currency = 'COP'): string {
    return `$${amount.toLocaleString('es-CO')} ${currency}`;
  }

  // ---------------------------------------------------------------------------
  // PR-06: notifyPaymentConfirmed — AC-12
  // ---------------------------------------------------------------------------

  /**
   * AC-12: Enqueue WhatsApp notification to merchant when payment is confirmed.
   * Works for both webhook (external gateway) and fallback manual command.
   * Idempotent via dedupeKey = `payment-confirmed-${orderCode}-${merchantId}`.
   */
  async notifyPaymentConfirmed(
    merchantId: string,
    payload: MerchantPaymentNotificationPayload,
  ): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, whatsappNumber: true },
    });

    if (!merchant) {
      this.logger.warn(`PaymentNotification: merchant ${merchantId} not found — skipping`);
      return;
    }

    if (!merchant.whatsappNumber) {
      this.logger.warn(
        `PaymentNotification: merchant ${merchantId} has no whatsappNumber — skipping`,
      );
      return;
    }

    const methodLabel =
      payload.method === 'transfer'
        ? 'Transferencia bancaria'
        : payload.method === 'cod'
          ? 'Contraentrega'
          : payload.method === 'payment_link'
            ? 'Pago en línea'
            : payload.method;

    const manualWarning = payload.isManual ? '\n⚠️ Pago manual — verifica la transferencia' : '';

    const message =
      `✅ Pago confirmado para ${payload.orderCode}\n` +
      `💵 ${payload.amount}\n` +
      `💳 ${methodLabel}${manualWarning}`;

    const dedupeKey = `payment-confirmed-${payload.orderCode}-${merchantId}`;

    await this.outboxRepository.create({
      merchant: { connect: { id: merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to: merchant.whatsappNumber,
      payloadJson: { text: message },
      dedupeKey,
    });

    this.logger.log(
      `Payment notification enqueued for merchant ${merchantId}: order ${payload.orderCode}`,
    );
  }
}
