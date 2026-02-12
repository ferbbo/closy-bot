/**
 * Category entity - groups products for easier organization
 */
export class Category {
  id: string;
  name: string;
  merchantId: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Category) {
    this.id = data.id;
    this.name = data.name;
    this.merchantId = data.merchantId;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
