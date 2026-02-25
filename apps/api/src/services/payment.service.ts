import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentRepository } from '../persistence/repositories/payment.repository';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { MerchantNotificationService } from './merchant-notification.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import type {
  ConfirmPaymentDto,
  ConfirmPaymentResult,
  PaymentWebhookPayload,
  WebhookResponseDto,
} from '../domain/entities/payment.entity';

/**
 * PaymentService
 * PR-06: Payments — confirmPayment + processWebhook + processFallbackCommand
 *
 * REQ-03: confirmPayment() — idempotent, transitions Order pending_payment → paid
 * REQ-05: processWebhook() — parse + validate + confirm (idempotent by paymentIntentId)
 * REQ-06: DB-level unique constraint on paymentIntentId → retry safe
 * REQ-08: processFallbackCommand() — manual confirmation flow step
 * REQ-09: notifies merchant on confirmation (via MerchantNotificationService)
 * REQ-10: graceful if Order already paid
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly merchantNotificationService: MerchantNotificationService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // AC-02, AC-03: confirmPayment — idempotent order-payment confirmation
  // ---------------------------------------------------------------------------

  /**
   * Create Payment + transition Order → paid, exactly once.
   *
   * Idempotency strategy:
   *  1. Check if Payment with paymentIntentId already exists → return existing
   *  2. Check if Order already paid → return graceful
   *  3. Create Payment + update Order in DB transaction
   *  4. If Prisma P2002 (concurrent duplicate) → catch + return idempotent OK
   *  5. Notify merchant
   */
  async confirmPayment(dto: ConfirmPaymentDto): Promise<ConfirmPaymentResult> {
    this.logger.log(`confirmPayment: paymentIntentId=${dto.paymentIntentId}`);

    // 1. Idempotency check (AC-03)
    const existing = await this.paymentRepository.findByPaymentIntentId(dto.paymentIntentId);
    if (existing) {
      this.logger.log(`Payment already processed: ${existing.id}`);
      return { success: true, paymentId: existing.id, alreadyProcessed: true };
    }

    // 2. Find order
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) {
      throw new NotFoundException(`Order ${dto.orderId} not found`);
    }

    // 3. Already paid (AC-13 — graceful)
    if (order.status === OrderStatus.paid) {
      const confirmedPayment = await this.paymentRepository.findConfirmedByOrderId(dto.orderId);
      this.logger.log(`Order ${order.orderCode} already paid — returning gracefully`);
      return {
        success: true,
        paymentId: confirmedPayment?.id ?? '',
        alreadyPaid: true,
      };
    }

    // 4. Create payment + transition order in transaction
    let payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            order: { connect: { id: dto.orderId } },
            amount: dto.amount,
            method: dto.method,
            status: PaymentStatus.confirmed,
            externalId: dto.externalId ?? null,
            paymentIntentId: dto.paymentIntentId,
            confirmedAt: new Date(),
            metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          },
        });

        await tx.order.update({
          where: { id: dto.orderId },
          data: { status: OrderStatus.paid },
        });

        return created;
      });
    } catch (err) {
      // Handle concurrent duplicate (P2002 unique constraint violation)
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(
          `Concurrent duplicate paymentIntentId=${dto.paymentIntentId} — idempotent return`,
        );
        const concurrent = await this.paymentRepository.findByPaymentIntentId(dto.paymentIntentId);
        return { success: true, paymentId: concurrent?.id ?? '', alreadyProcessed: true };
      }
      throw err;
    }

    this.logger.log(`Payment confirmed: ${payment.id} for order ${order.orderCode}`);

    // 5. Notify merchant (AC-12) — fire-and-forget
    this.merchantNotificationService
      .notifyPaymentConfirmed(order.merchantId, {
        type: 'PAYMENT_CONFIRMED',
        orderCode: order.orderCode,
        amount: this.formatAmount(Number(order.totalAmount)),
        method: dto.method,
        timestamp: new Date().toISOString(),
        isManual: dto.paymentIntentId.startsWith('manual_'),
      })
      .catch((notifyErr: Error) =>
        this.logger.warn(`Failed to notify merchant: ${notifyErr.message}`),
      );

    return { success: true, paymentId: payment.id };
  }

  // ---------------------------------------------------------------------------
  // AC-06, AC-07: processWebhook — parse gateway payload + confirm/record
  // ---------------------------------------------------------------------------

  /**
   * Process payment webhook from external gateway.
   * - Approved → confirmPayment() (idempotent)
   * - Rejected → record Payment with status=failed (idempotent)
   *
   * @param payload   parsed webhook body
   * @param merchantId merchant resolved from API key header
   */
  async processWebhook(
    payload: PaymentWebhookPayload,
    merchantId: string,
  ): Promise<WebhookResponseDto> {
    this.logger.log(
      `processWebhook: paymentIntentId=${payload.payment_intent_id} status=${payload.status}`,
    );

    // AC-07: rejected webhook → record failed payment (idempotent)
    if (payload.status === 'rejected') {
      const existing = await this.paymentRepository.findByPaymentIntentId(
        payload.payment_intent_id,
      );
      if (existing) {
        return {
          success: true,
          payment_id: existing.id,
          order_code: payload.order_code,
          status: 'failed',
          message: 'Payment already processed',
        };
      }

      // Find order to get orderId
      const order = await this.orderRepository.findByOrderCode(payload.order_code, merchantId);
      if (!order) {
        throw new NotFoundException(`Order ${payload.order_code} not found`);
      }

      const failedPayment = await this.paymentRepository.create({
        order: { connect: { id: order.id } },
        amount: payload.amount,
        method: payload.method,
        status: PaymentStatus.failed,
        externalId: payload.external_id ?? null,
        paymentIntentId: payload.payment_intent_id,
        metadata: (payload.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      });

      return {
        success: true,
        payment_id: failedPayment.id,
        order_code: payload.order_code,
        status: 'failed',
      };
    }

    // Approved → find order + confirm
    const order = await this.orderRepository.findByOrderCode(payload.order_code, merchantId);
    if (!order) {
      throw new NotFoundException(`Order ${payload.order_code} not found`);
    }

    const result = await this.confirmPayment({
      orderId: order.id,
      amount: payload.amount,
      method: payload.method,
      paymentIntentId: payload.payment_intent_id,
      externalId: payload.external_id,
      metadata: payload.metadata,
    });

    const responseMessage = result.alreadyProcessed
      ? 'Payment already processed'
      : result.alreadyPaid
        ? 'Order already paid'
        : undefined;

    return {
      success: true,
      payment_id: result.paymentId,
      order_code: payload.order_code,
      status: 'confirmed',
      message: responseMessage,
    };
  }

  // ---------------------------------------------------------------------------
  // AC-11: generateManualPaymentIntentId — unique key for manual payments
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique paymentIntentId for manual (fallback command) payments.
   * Format: "manual_{orderId}_{timestampMs}" — AC-11
   */
  generateManualPaymentIntentId(orderId: string): string {
    return `manual_${orderId}_${Date.now()}`;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatAmount(amount: number, currency = 'COP'): string {
    return `$${amount.toLocaleString('es-CO')} ${currency}`;
  }
}
