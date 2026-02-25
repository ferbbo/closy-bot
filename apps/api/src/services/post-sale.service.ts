/**
 * PostSaleService
 * PR-07: Post-sale support — REQ-03, REQ-04, AC-02, AC-03, AC-04
 *
 * Handles:
 * - getOrderStatus(): fetch last or specific order for a customer
 * - createTicket(): create support ticket with status 'open'
 */

import { Injectable, Logger } from '@nestjs/common';
import { TicketType } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PlaybookService } from './playbook.service';
import type { MerchantPlaybookData } from './playbook.service';
import type { CreateTicketResult, OrderStatusResult } from '../domain/entities/ticket.entity';

@Injectable()
export class PostSaleService {
  private readonly logger = new Logger(PostSaleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly playbookService: PlaybookService,
  ) {}

  // ---------------------------------------------------------------------------
  // REQ-03, AC-02, AC-03: getOrderStatus
  // ---------------------------------------------------------------------------

  /**
   * AC-02: Returns last order for customer (no orderCode)
   * AC-03: Returns specific order when orderCode provided
   *
   * @param merchantId - Merchant scoping
   * @param customerId - Customer ID
   * @param orderCode - Optional: specific order code (e.g. "ORD-001")
   * @param merchant - For template interpolation
   */
  async getOrderStatus(
    merchantId: string,
    customerId: string,
    merchant: MerchantPlaybookData,
    orderCode?: string,
  ): Promise<OrderStatusResult> {
    let order: {
      id: string;
      orderCode: string;
      status: string;
      totalAmount: { toNumber: () => number };
      shippingAddress: string;
      customerName: string;
      createdAt: Date;
    } | null = null;

    if (orderCode) {
      // AC-03: search by specific orderCode
      order = await this.prisma.order.findFirst({
        where: {
          merchantId,
          customerId,
          orderCode: { equals: orderCode, mode: 'insensitive' },
        },
        select: {
          id: true,
          orderCode: true,
          status: true,
          totalAmount: true,
          shippingAddress: true,
          customerName: true,
          createdAt: true,
        },
      });
    } else {
      // AC-02: return last order (most recent, non-cancelled preferred)
      order = await this.prisma.order.findFirst({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderCode: true,
          status: true,
          totalAmount: true,
          shippingAddress: true,
          customerName: true,
          createdAt: true,
        },
      });
    }

    if (!order) {
      this.logger.debug(`No orders found for customer ${customerId}`);
      const noOrderMessage = this.playbookService.getMessage(merchant, 'noOrderFound');
      return { found: false, message: noOrderMessage };
    }

    // Build template-based status message
    const statusMessage = this.getStatusMessage(merchant, order.status, '');
    const template = this.playbookService.getMessage(merchant, 'orderStatusTemplate', {
      orderCode: order.orderCode,
      statusMessage,
    });

    return {
      found: true,
      order: {
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        totalAmount: order.totalAmount.toNumber(),
        shippingAddress: order.shippingAddress,
        customerName: order.customerName,
        createdAt: order.createdAt,
      },
      message: template,
    };
  }

  /**
   * Get status message for each OrderStatus value
   * Uses PlaybookMessages for template-first responses
   * AC-05: template per order.status
   */
  getStatusMessage(merchant: MerchantPlaybookData, status: string, trackingInfo: string): string {
    switch (status) {
      case 'pending_payment':
        return this.playbookService.getMessage(merchant, 'orderStatusPendingPayment');
      case 'confirmed':
        return this.playbookService.getMessage(merchant, 'orderStatusConfirmed');
      case 'paid':
        return this.playbookService.getMessage(merchant, 'orderStatusPaid');
      case 'shipped':
        return this.playbookService.getMessage(merchant, 'orderStatusShipped', {
          trackingInfo: trackingInfo || 'En camino',
        });
      case 'delivered':
        return this.playbookService.getMessage(merchant, 'orderStatusDelivered');
      case 'cancelled':
        return this.playbookService.getMessage(merchant, 'orderStatusCancelled');
      default:
        return this.playbookService.getMessage(merchant, 'orderStatusConfirmed');
    }
  }

  // ---------------------------------------------------------------------------
  // REQ-04, AC-04: createTicket
  // ---------------------------------------------------------------------------

  /**
   * AC-04: Creates a Ticket with status 'open'
   *
   * @param orderId - Order FK
   * @param customerId - Customer FK
   * @param merchantId - Merchant FK
   * @param type - TicketType (missing, damaged, delay, other)
   * @param description - Ticket description from customer
   */
  async createTicket(
    orderId: string,
    customerId: string,
    merchantId: string,
    type: TicketType,
    description: string,
  ): Promise<CreateTicketResult> {
    this.logger.log(`Creating ticket: orderId=${orderId}, type=${type}, customerId=${customerId}`);

    // Get order to include orderCode in result
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderCode: true },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        orderId,
        customerId,
        merchantId,
        type,
        status: 'open',
        description,
      },
      select: { id: true },
    });

    this.logger.log(`Ticket created: ${ticket.id} for order ${order.orderCode}`);

    return {
      ticketId: ticket.id,
      orderCode: order.orderCode,
      type,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper: find order by code (used by PostSaleFlow)
  // ---------------------------------------------------------------------------

  async findOrderByCode(
    merchantId: string,
    customerId: string,
    orderCode: string,
  ): Promise<{ id: string; orderCode: string } | null> {
    return this.prisma.order.findFirst({
      where: {
        merchantId,
        customerId,
        orderCode: { equals: orderCode, mode: 'insensitive' },
      },
      select: { id: true, orderCode: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Helper: detect TicketType from message text (keyword-based)
  // AC-08: keyword classification
  // ---------------------------------------------------------------------------

  detectTicketType(text: string): TicketType | null {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    if (/falta|incompleto|no estaba|no vino|no llego/.test(normalized)) return 'missing';
    if (/danado|danada|roto|rota|golpeado|rayado|defecto/.test(normalized)) return 'damaged';
    if (/demora|tarde|tardanza|no llego|no ha llegado|retraso/.test(normalized)) return 'delay';
    // 'other' only if ambiguous (flow will prompt user)
    return null;
  }
}
