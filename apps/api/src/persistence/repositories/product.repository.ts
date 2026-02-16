import { Injectable, Logger } from '@nestjs/common';
import { Product, ProductVariant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Extended Product type with variants included
 */
export type ProductWithVariants = Product & {
  variants: ProductVariant[];
};

/**
 * Repository for Product persistence
 * Handles product CRUD and search operations
 */
@Injectable()
export class ProductRepository {
  private readonly logger = new Logger(ProductRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new product with variants
   */
  async create(data: Prisma.ProductCreateInput): Promise<ProductWithVariants> {
    return this.prisma.product.create({
      data,
      include: { variants: true },
    });
  }

  /**
   * Find a product by ID with variants
   */
  async findById(id: string): Promise<ProductWithVariants | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });
  }

  /**
   * Find products by merchant
   */
  async findByMerchant(merchantId: string): Promise<ProductWithVariants[]> {
    return this.prisma.product.findMany({
      where: { merchantId },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Search products by text query in name and description
   * @param merchantId - Filter by merchant
   * @param query - Text to search in name/description
   * @param limit - Maximum results (default 20)
   * @param onlyAvailable - Only return active products with stock (default true)
   */
  async search(
    merchantId: string,
    query: string,
    limit = 20,
    onlyAvailable = true,
  ): Promise<ProductWithVariants[]> {
    const whereClause: Prisma.ProductWhereInput = {
      merchantId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (onlyAvailable) {
      whereClause.isActive = true;
      whereClause.variants = {
        some: {
          isActive: true,
          stock: { gt: 0 },
        },
      };
    }

    return this.prisma.product.findMany({
      where: whereClause,
      include: {
        variants: onlyAvailable
          ? {
              where: {
                isActive: true,
                stock: { gt: 0 },
              },
            }
          : true,
      },
      take: limit,
      orderBy: [
        // Exact name match first
        { name: 'asc' },
      ],
    });
  }

  /**
   * Find products by category
   */
  async findByCategory(categoryId: string, onlyActive = true): Promise<ProductWithVariants[]> {
    const where: Prisma.ProductWhereInput = { categoryId };

    if (onlyActive) {
      where.isActive = true;
    }

    return this.prisma.product.findMany({
      where,
      include: { variants: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find product by ID and merchantId (multi-tenant isolation)
   * Returns null if not found or belongs to different merchant
   */
  async findByIdAndMerchant(id: string, merchantId: string): Promise<ProductWithVariants | null> {
    return this.prisma.product.findFirst({
      where: {
        id,
        merchantId,
      },
      include: { variants: true },
    });
  }

  /**
   * Update product
   */
  async update(id: string, data: Prisma.ProductUpdateInput): Promise<ProductWithVariants> {
    return this.prisma.product.update({
      where: { id },
      data,
      include: { variants: true },
    });
  }

  /**
   * Soft delete product (set isActive to false)
   * @param id - Product ID
   * @returns Updated product
   */
  async softDelete(id: string): Promise<ProductWithVariants> {
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: { variants: true },
    });
  }

  /**
   * Find variant by SKU and product
   */
  async findVariantBySku(productId: string, sku: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findUnique({
      where: {
        productId_sku: {
          productId,
          sku,
        },
      },
    });
  }

  /**
   * Create or update a product variant (upsert by SKU)
   * Note: SKU is required for idempotency
   */
  async upsertVariant(
    productId: string,
    sku: string,
    data: Prisma.ProductVariantCreateInput,
  ): Promise<ProductVariant> {
    return this.prisma.productVariant.upsert({
      where: {
        productId_sku: {
          productId,
          sku,
        },
      },
      create: data,
      update: {
        name: data.name,
        price: data.price,
        stock: data.stock,
        isActive: data.isActive,
      },
    });
  }
}
