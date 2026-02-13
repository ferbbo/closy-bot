import { CartItem } from './cart-item.entity';

/**
 * Cart entity - represents a customer's shopping cart
 */
export class Cart {
  id: string;
  customerId: string;
  conversationId: string;
  createdAt: Date;
  updatedAt: Date;
  items?: CartItem[];

  constructor(data: Cart) {
    this.id = data.id;
    this.customerId = data.customerId;
    this.conversationId = data.conversationId;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.items = data.items;
  }

  /**
   * Calculate total number of items in cart
   */
  getTotalItems(): number {
    if (!this.items || this.items.length === 0) {
      return 0;
    }
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Calculate subtotal (sum of all item totals)
   */
  getSubtotal(): number {
    if (!this.items || this.items.length === 0) {
      return 0;
    }
    return this.items.reduce((sum, item) => sum + item.getTotal(), 0);
  }

  /**
   * Check if cart is empty
   */
  isEmpty(): boolean {
    return !this.items || this.items.length === 0;
  }
}
