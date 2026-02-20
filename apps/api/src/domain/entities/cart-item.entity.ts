import { Decimal } from '@prisma/client/runtime/library';

/**
 * CartItem entity - represents a line item in a shopping cart
 * PR-04: Cart CRUD conversacional
 */
export class CartItem {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  priceSnapshot: Decimal;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: CartItem) {
    this.id = data.id;
    this.cartId = data.cartId;
    this.variantId = data.variantId;
    this.quantity = data.quantity;
    this.priceSnapshot = data.priceSnapshot;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Calculate subtotal for this item
   */
  getSubtotal(): number {
    return this.priceSnapshot.toNumber() * this.quantity;
  }

  /**
   * Get price as number for calculations
   */
  getPriceAsNumber(): number {
    return this.priceSnapshot.toNumber();
  }

  /**
   * Update quantity (minimum 1)
   */
  updateQuantity(newQuantity: number): void {
    if (newQuantity < 1) {
      throw new Error('Quantity must be at least 1');
    }
    this.quantity = newQuantity;
  }
}
