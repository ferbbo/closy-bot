import { Injectable, Logger } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for Category persistence
 * Handles category CRUD operations
 */
@Injectable()
export class CategoryRepository {
  private readonly logger = new Logger(CategoryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new category
   * @throws PrismaClientKnownRequestError with code 'P2002' if name already exists for merchant
   */
  async create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  /**
   * Find all categories for a merchant
   */
  async findByMerchant(merchantId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find a category by name for a specific merchant
   */
  async findByNameAndMerchant(name: string, merchantId: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: {
        merchantId_name: {
          merchantId,
          name,
        },
      },
    });
  }

  /**
   * Find a category by ID
   */
  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
    });
  }

  /**
   * Update category
   */
  async update(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }
}
