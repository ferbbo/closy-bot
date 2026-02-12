/**
 * Product entity - represents a catalog item
 */
export class Product {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  merchantId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Product) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.categoryId = data.categoryId;
    this.merchantId = data.merchantId;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
