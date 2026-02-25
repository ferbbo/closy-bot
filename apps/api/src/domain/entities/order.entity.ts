import { OrderStatus } from '@prisma/client';

/**
 * Order entity — represents a confirmed purchase
 * PR-05: Checkout Order Creation
 */
export class Order {
  id!: string;
  orderCode!: string;
  merchantId!: string;
  customerId!: string;
  status!: OrderStatus;
  totalAmount!: number; // stored as Decimal in DB, exposed as number
  shippingAddress!: string;
  customerName!: string;
  customerPhone!: string;
  paymentMethod!: string;
  notes!: string | null;
  shippingCost!: number;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(data: Order) {
    Object.assign(this, data);
  }

  isPendingPayment(): boolean {
    return this.status === OrderStatus.pending_payment;
  }

  isCancelled(): boolean {
    return this.status === OrderStatus.cancelled;
  }
}
