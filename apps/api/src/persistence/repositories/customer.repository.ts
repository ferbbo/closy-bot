import { Injectable, Logger } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for Customer persistence
 * Handles customer identity resolution by phone number
 */
@Injectable()
export class CustomerRepository {
  private readonly logger = new Logger(CustomerRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new customer
   * @throws PrismaClientKnownRequestError with code 'P2002' if phone already exists
   */
  async create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  /**
   * Find a customer by phone number (unique)
   */
  async findByPhone(phone: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { phone },
    });
  }

  /**
   * Find a customer by ID
   */
  async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  /**
   * Update customer data
   */
  async update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data,
    });
  }
}
