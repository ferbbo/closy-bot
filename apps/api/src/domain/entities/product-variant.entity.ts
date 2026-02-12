import { Decimal } from '@prisma/client/runtime/library';

/**
 * ProductVariant entity - represents a specific SKU with price and stock
 */
export class ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: Decimal;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: ProductVariant) {
    this.id = data.id;
    this.productId = data.productId;
    this.sku = data.sku;
    this.name = data.name;
    this.price = data.price;
    this.stock = data.stock;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Check if variant is available for purchase
   */
  isAvailable(): boolean {
    return this.isActive && this.stock > 0;
  }

  /**
   * Get price as number for calculations
   */
  getPriceAsNumber(): number {
    return this.price.toNumber();
  }
}
