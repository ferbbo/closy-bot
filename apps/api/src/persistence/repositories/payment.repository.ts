import { Injectable, Logger } from '@nestjs/common';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PaymentRepository
 * PR-06: Payments — REQ-01, AC-01, AC-08
 *
 * DB-level idempotency via unique constraint on paymentIntentId.
 */
@Injectable()
export class PaymentRepository {
  private readonly logger = new Logger(PaymentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find payment by paymentIntentId — used for idempotency check (AC-08)
   */
  async findByPaymentIntentId(paymentIntentId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { paymentIntentId },
    });
  }

  /**
   * Create a new payment record
   * May throw Prisma P2002 (UniqueConstraintViolation) if concurrent duplicate
   */
  async create(data: Prisma.PaymentCreateInput): Promise<Payment> {
    return this.prisma.payment.create({ data });
  }

  /**
   * Find payments by orderId
   */
  async findByOrderId(orderId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find the confirmed payment for an order (first one)
   */
  async findConfirmedByOrderId(orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.confirmed },
    });
  }
}
