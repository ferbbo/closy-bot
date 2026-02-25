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
   * Full-Text Search using PostgreSQL tsvector + tsquery (PR-03.5.2)
   * Uses 'simple' config for Spanglish support (no stemming)
   * Falls back to ILIKE search if FTS returns 0 results
   * @param merchantId - Filter by merchant
   * @param query - Natural language search query
   * @param limit - Maximum results (default 20)
   * @returns Products ordered by relevance (ts_rank)
   */
  async searchFts(merchantId: string, query: string, limit = 20): Promise<ProductWithVariants[]> {
    // Sanitize input - plainto_tsquery handles special chars automatically
    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      // Raw SQL for FTS with ts_rank scoring
      // Uses parameterized queries to prevent SQL injection
      const products = await this.prisma.$queryRaw<Product[]>`
        SELECT p.*,
               ts_rank(
                 to_tsvector('simple', COALESCE(p.search_text, '')),
                 plainto_tsquery('simple', ${query})
               ) AS rank
        FROM products p
        WHERE p.merchant_id = ${merchantId}
          AND p.is_active = true
          AND to_tsvector('simple', COALESCE(p.search_text, '')) @@ plainto_tsquery('simple', ${query})
        ORDER BY rank DESC
        LIMIT ${limit}
      `;

      // If FTS returns 0 results, fallback to ILIKE search
      if (products.length === 0) {
        this.logger.log(
          `FTS returned 0 results for query "${query}", falling back to ILIKE search`,
        );
        return this.search(merchantId, query, limit, true);
      }

      // Load variants for each product (FTS only returns Product rows)
      const productIds = products.map((p) => p.id);
      const productsWithVariants = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          merchantId, // Defense in depth: ensure multi-tenancy
          isActive: true,
          variants: {
            some: {
              isActive: true,
              stock: { gt: 0 },
            },
          },
        },
        include: {
          variants: {
            where: {
              isActive: true,
              stock: { gt: 0 },
            },
          },
        },
      });

      // Re-order by FTS rank (since Prisma query loses the ordering)
      const productRankMap = new Map(products.map((p) => [p.id, p]));
      return productsWithVariants.sort((a, b) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rankA = (productRankMap.get(a.id) as any)?.rank || 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rankB = (productRankMap.get(b.id) as any)?.rank || 0;
        return rankB - rankA;
      });
    } catch (error) {
      this.logger.error(`FTS query failed: ${(error as Error).message}`, (error as Error).stack);
      // Fallback to ILIKE on error
      return this.search(merchantId, query, limit, true);
    }
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
   * Find product by variant ID (PR-04: for cart operations)
   */
  async findByVariantId(variantId: string): Promise<ProductWithVariants | null> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });

    if (!variant) {
      return null;
    }

    return this.findById(variant.productId);
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
