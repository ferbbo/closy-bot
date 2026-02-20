import { CartStatus } from '@prisma/client';

/**
 * Cart entity - represents a shopping cart for conversational commerce
 * PR-04: Cart CRUD conversacional
 */
export class Cart {
  id: string;
  customerId: string;
  merchantId: string;
  status: CartStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Cart) {
    this.id = data.id;
    this.customerId = data.customerId;
    this.merchantId = data.merchantId;
    this.status = data.status;
    this.expiresAt = data.expiresAt;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Check if cart is active (not abandoned or completed)
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Check if cart has expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Mark cart as abandoned
   */
  abandon(): void {
    this.status = 'abandoned';
  }

  /**
   * Mark cart as completed
   */
  complete(): void {
    this.status = 'completed';
  }
}
