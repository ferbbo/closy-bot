/**
 * Merchant entity - represents a business using the platform
 */
export class Merchant {
  id: string;
  name: string;
  whatsappNumber: string;
  apiKey: string;
  botPaused?: boolean; // PR-05.1: pause bot for customer messages
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Merchant) {
    this.id = data.id;
    this.name = data.name;
    this.whatsappNumber = data.whatsappNumber;
    this.apiKey = data.apiKey;
    this.botPaused = data.botPaused;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
