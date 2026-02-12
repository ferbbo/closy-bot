import { Injectable, Logger } from '@nestjs/common';
import { Merchant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for Merchant persistence
 */
@Injectable()
export class MerchantRepository {
  private readonly logger = new Logger(MerchantRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new merchant
   * @throws PrismaClientKnownRequestError with code 'P2002' if apiKey already exists
   */
  async create(data: Prisma.MerchantCreateInput): Promise<Merchant> {
    return this.prisma.merchant.create({ data });
  }

  /**
   * Find a merchant by API key (unique)
   */
  async findByApiKey(apiKey: string): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: { apiKey },
    });
  }

  /**
   * Find a merchant by ID
   */
  async findById(id: string): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: { id },
    });
  }

  /**
   * Update merchant data
   */
  async update(id: string, data: Prisma.MerchantUpdateInput): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data,
    });
  }
}
