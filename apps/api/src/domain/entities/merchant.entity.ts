/**
 * Merchant entity - represents a business using the platform
 */
export class Merchant {
  id: string;
  name: string;
  whatsappNumber: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Merchant) {
    this.id = data.id;
    this.name = data.name;
    this.whatsappNumber = data.whatsappNumber;
    this.apiKey = data.apiKey;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
