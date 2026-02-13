import { Decimal } from '@prisma/client/runtime/library';

/**
 * CartItem entity - represents a single product in the cart
 */
export class CartItem {
  id: string;
  cartId: string;
  productId: string;
  productVariantId: string | null;
  quantity: number;
  unitPrice: Decimal;
  createdAt: Date;

  constructor(data: CartItem) {
    this.id = data.id;
    this.cartId = data.cartId;
    this.productId = data.productId;
    this.productVariantId = data.productVariantId;
    this.quantity = data.quantity;
    this.unitPrice = data.unitPrice;
    this.createdAt = data.createdAt;
  }

  /**
   * Calculate total for this item (unitPrice * quantity)
   */
  getTotal(): number {
    return this.unitPrice.toNumber() * this.quantity;
  }

  /**
   * Get unit price as number for calculations
   */
  getUnitPriceAsNumber(): number {
    return this.unitPrice.toNumber();
  }
}
