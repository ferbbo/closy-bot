/**
 * Customer entity - represents an end-user identified by phone number
 */
export class Customer {
  id: string;
  phone: string;
  name: string | null;
  language: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Customer) {
    this.id = data.id;
    this.phone = data.phone;
    this.name = data.name;
    this.language = data.language;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Normalizes phone number by removing spaces, dashes, and parentheses
   * @param phone Raw phone number
   * @returns Normalized phone number
   */
  static normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()]/g, '');
  }
}
