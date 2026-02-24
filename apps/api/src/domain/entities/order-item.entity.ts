/**
 * OrderItem entity — snapshot of a product variant at time of purchase
 * PR-05: Checkout Order Creation
 */
export class OrderItem {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  unitPrice: number; // Snapshot at purchase time (no dependency on future catalog changes)
  snapshotName: string; // "Product name - Variant name" at purchase time
  createdAt: Date;

  constructor(data: OrderItem) {
    Object.assign(this, data);
  }

  subtotal(): number {
    return this.unitPrice * this.quantity;
  }
}
