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
    // Split query into words and filter out short words (< 2 chars)
    const words = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    if (words.length === 0) {
      return [];
    }

    // Build AND conditions for each word (must match in name OR description)
    const wordConditions: Prisma.ProductWhereInput[] = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' as const } },
        { description: { contains: word, mode: 'insensitive' as const } },
      ],
    }));

    const whereClause: Prisma.ProductWhereInput = {
      merchantId,
      AND: wordConditions,
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
   * Strategy: 1) Try original query, 2) Try normalized (plural removal), 3) Trigram fallback, 4) ILIKE fallback
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

    // Use lowercase query directly for FTS (simple config is case-insensitive)
    const ftsQuery = query.toLowerCase().trim();

    // Also prepare normalized version (Spanish plural removal)
    const normalizedFtsQuery = this.normalizeSpanishPlurals(ftsQuery);
    const shouldTryNormalized = normalizedFtsQuery !== ftsQuery;

    this.logger.debug(
      `FTS query: "${query}" → fts: "${ftsQuery}"${shouldTryNormalized ? ` → normalized: "${normalizedFtsQuery}"` : ''}`,
    );

    try {
      // First attempt: original query
      let products = await this.executeFtsQuery(merchantId, ftsQuery, limit);

      // Second attempt: normalized query (if different and first failed)
      if (products.length === 0 && shouldTryNormalized) {
        this.logger.debug(`FTS retry with normalized query: "${normalizedFtsQuery}"`);
        products = await this.executeFtsQuery(merchantId, normalizedFtsQuery, limit);
      }

      // Third attempt: trigram similarity search (fuzzy matching)
      if (products.length === 0) {
        this.logger.debug(`FTS returned 0 results, trying trigram search for: "${ftsQuery}"`);
        products = await this.searchTrigram(merchantId, ftsQuery, limit);
      }

      // Fourth attempt (last resort): ILIKE search
      if (products.length === 0) {
        this.logger.log(
          `Trigram returned 0 results for query "${query}", falling back to ILIKE search`,
        );
        return this.search(merchantId, query, limit, true);
      }

      // Load variants for each product (FTS/trigram only returns Product rows)
      return this.loadVariantsForProducts(products, merchantId);
    } catch (error) {
      this.logger.error(`FTS query failed: ${(error as Error).message}`, (error as Error).stack);
      // Fallback to ILIKE on error
      return this.search(merchantId, query, limit, true);
    }
  }

  /**
   * Normalize Spanish plurals: "azules" → "azul", "camisas" → "camisa"
   * Preserves words that shouldn't be stripped (e.g., "jeans" stays "jeans")
   */
  private normalizeSpanishPlurals(query: string): string {
    // Common words that should NOT be normalized (English loanwords, etc.)
    const preserveWords = new Set(['jeans', 'shorts', 'tops', 'sweaters', 'sneakers', 'boots']);

    return query
      .split(/\s+/)
      .map((word) => {
        if (preserveWords.has(word)) return word;
        if (word.length <= 3) return word; // Skip short words
        // Spanish plural rules:
        // - Words ending in vowel + s: "camisas" → "camisa"
        // - Words ending in -es after consonant: "pantalones" → "pantalon"
        // - Words ending in -ces: "azules" → "azul" (z→c transformation handled by removing -es)
        if (word.endsWith('es') && word.length > 4) {
          // Handle "azules" → "azul" (es after l)
          // Handle "pantalones" → "pantalon" (es after n)
          return word.slice(0, -2);
        }
        if (word.endsWith('s') && word.length > 3) {
          const beforeS = word[word.length - 2];
          // Only remove 's' if preceded by a vowel (Spanish rule)
          if ('aeiouáéíóú'.includes(beforeS)) {
            return word.slice(0, -1);
          }
        }
        return word;
      })
      .join(' ');
  }

  /**
   * Execute FTS query and return raw Product results
   * Uses search_text_weighted (tsvector) for ranking: A=name, B=brand, C=tags, D=description
   * Matches in name (weight A) rank higher than matches in description (weight D) — AC-03, REQ-03
   */
  private async executeFtsQuery(
    merchantId: string,
    ftsQuery: string,
    limit: number,
  ): Promise<Product[]> {
    return this.prisma.$queryRaw<Product[]>`
      SELECT p.*,
             ts_rank(
               p.search_text_weighted,
               plainto_tsquery('simple', ${ftsQuery})
             ) AS rank
      FROM products p
      WHERE p.merchant_id = ${merchantId}
        AND p.is_active = true
        AND p.search_text_weighted @@ plainto_tsquery('simple', ${ftsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  // Spanish stopwords that should not be used for trigram matching
  private readonly TRIGRAM_STOPWORDS = new Set([
    // Prepositions
    'desde',
    'hasta',
    'para',
    'con',
    'sin',
    'por',
    'entre',
    'sobre',
    'bajo',
    // Articles
    'los',
    'las',
    'del',
    'una',
    'uno',
    'unos',
    'unas',
    // Common verbs/intent words (already handled by sanitization)
    'busco',
    'quiero',
    'necesito',
    'tienes',
    'tienen',
    'tendras',
    'hay',
    // Courtesy
    'favor',
    'gracias',
    'porfa',
    'porfavor',
    'please',
    'plis',
    // Filler
    'muy',
    'mas',
    'más',
    'algo',
    'como',
    'que',
    'cual',
  ]);

  /**
   * Trigram similarity search using pg_trgm extension
   * Finds products where ANY word in the query has high similarity to search_text
   * Example: "busco jeans por favor" → finds "jeans" with 0.4+ similarity
   * @param merchantId - Filter by merchant
   * @param query - User's search query (may contain noise words)
   * @param limit - Maximum results
   * @param threshold - Minimum similarity score (default 0.4)
   */
  private async searchTrigram(
    merchantId: string,
    query: string,
    limit: number,
    threshold = 0.4, // Increased from 0.3 to reduce false positives
  ): Promise<Product[]> {
    // Extract meaningful words: 3+ chars, not stopwords, not pure numbers
    const words = query
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .filter((w) => !this.TRIGRAM_STOPWORDS.has(w.toLowerCase()))
      .filter((w) => !/^\d+$/.test(w)) // Remove pure numbers (prices)
      .slice(0, 5); // Max 5 words to avoid expensive queries

    if (words.length === 0) {
      return [];
    }

    this.logger.debug(`Trigram words after filtering: [${words.join(', ')}]`);

    // Search each word independently and combine results
    // This avoids complex dynamic SQL and works reliably
    const allResults = new Map<string, Product & { similarity: number }>();

    for (const word of words) {
      const wordResults = await this.prisma.$queryRaw<(Product & { similarity: number })[]>`
        SELECT p.*,
               word_similarity(${word}, COALESCE(p.search_text, '')) AS similarity
        FROM products p
        WHERE p.merchant_id = ${merchantId}
          AND p.is_active = true
          AND word_similarity(${word}, COALESCE(p.search_text, '')) >= ${threshold}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;

      // Merge results, keeping highest similarity per product
      for (const result of wordResults) {
        const existing = allResults.get(result.id);
        if (!existing || result.similarity > existing.similarity) {
          allResults.set(result.id, result);
        }
      }
    }

    // Sort by best similarity and return top N
    const sorted = Array.from(allResults.values()).sort((a, b) => b.similarity - a.similarity);

    this.logger.debug(
      `Trigram search for "${query}" found ${sorted.length} products (words: ${words.join(', ')})`,
    );

    return sorted.slice(0, limit);
  }

  /**
   * Load variants for products from FTS results
   */
  private async loadVariantsForProducts(
    products: Product[],
    merchantId: string,
  ): Promise<ProductWithVariants[]> {
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
   * Find variant by ID with product relation (for ownership check)
   * Used by PR-FE-04.1 inline edit — ensures variant belongs to merchant's product
   * @param id - Variant UUID
   */
  async findVariantByIdWithProduct(
    id: string,
  ): Promise<(ProductVariant & { product: { merchantId: string } }) | null> {
    return this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: {
          select: { merchantId: true },
        },
      },
    });
  }

  /**
   * Update variant by ID (direct ID update, NOT by SKU)
   * Used for inline editing in dashboard (PR-FE-04.1)
   * @param id - Variant UUID
   * @param data - Partial update data (price, stock, isActive)
   */
  async updateVariantById(
    id: string,
    data: { price?: number; stock?: number; isActive?: boolean },
  ): Promise<ProductVariant> {
    return this.prisma.productVariant.update({
      where: { id },
      data,
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
