/**
 * Ticket Entity
 * PR-07: Post-sale support tickets — REQ-01, AC-01
 */

import { TicketType, TicketStatus } from '@prisma/client';

export { TicketType, TicketStatus };

export interface CreateTicketDto {
  orderId: string;
  customerId: string;
  merchantId: string;
  type: TicketType;
  description: string;
}

export interface CreateTicketResult {
  ticketId: string;
  orderCode: string;
  type: TicketType;
}

export interface OrderStatusResult {
  found: boolean;
  order?: {
    id: string;
    orderCode: string;
    status: string;
    totalAmount: number;
    shippingAddress: string;
    customerName: string;
    createdAt: Date;
  };
  message: string;
}
