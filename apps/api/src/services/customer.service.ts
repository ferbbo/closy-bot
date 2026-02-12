import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Customer } from '../domain/entities/customer.entity';
import { CustomerRepository } from '../persistence/repositories/customer.repository';

/**
 * Customer service - handles customer identity resolution
 */
@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(private readonly customerRepository: CustomerRepository) {}

  /**
   * Resolve customer by phone number (idempotent get-or-create)
   * Normalizes phone number before lookup
   * @param phone Raw phone number
   * @param name Optional name for new customers
   * @param language Optional language code (defaults to 'es')
   * @returns Existing or newly created customer
   */
  async resolveByPhone(phone: string, name?: string, language = 'es'): Promise<Customer> {
    const normalizedPhone = Customer.normalizePhone(phone);

    // Mask phone in logs for PII protection
    const maskedPhone = this.maskPhone(normalizedPhone);
    this.logger.log(`Resolving customer by phone: ${maskedPhone}`);

    // Try to find existing customer
    let customer = await this.customerRepository.findByPhone(normalizedPhone);

    if (customer) {
      this.logger.log(`Customer found: ${customer.id}`);
      return customer;
    }

    // Create new customer if not found
    this.logger.log(`Creating new customer for phone: ${maskedPhone}`);
    try {
      customer = await this.customerRepository.create({
        phone: normalizedPhone,
        name: name ?? null,
        language,
      });
      this.logger.log(`Customer created: ${customer.id}`);
      return customer;
    } catch (error: unknown) {
      // Handle race condition: another concurrent request created the customer
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Customer already exists (race condition): ${maskedPhone}`);
        const existing = await this.customerRepository.findByPhone(normalizedPhone);
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async findById(id: string): Promise<Customer | null> {
    return this.customerRepository.findById(id);
  }

  /**
   * Update customer name
   */
  async updateName(id: string, name: string): Promise<Customer> {
    this.logger.log(`Updating customer name: ${id}`);
    return this.customerRepository.update(id, { name });
  }

  /**
   * Update customer language preference
   */
  async updateLanguage(id: string, language: string): Promise<Customer> {
    this.logger.log(`Updating customer language: ${id} -> ${language}`);
    return this.customerRepository.update(id, { language });
  }

  /**
   * Mask phone number for PII protection in logs
   * Example: +573001234567 -> +573****4567
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 8) {
      return '****';
    }
    const prefix = phone.slice(0, 4);
    const suffix = phone.slice(-4);
    return `${prefix}****${suffix}`;
  }
}
