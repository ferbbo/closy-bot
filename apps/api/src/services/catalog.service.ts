import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProductRepository,
  ProductWithVariants,
} from '../persistence/repositories/product.repository';
import { CategoryRepository } from '../persistence/repositories/category.repository';

/**
 * CatalogService provides product search and retrieval
 * Enforces multi-tenancy and availability filters
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly ftsEnabled: boolean;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly configService: ConfigService,
  ) {
    // PR-03.5.2: Feature flag for Full-Text Search (default: true)
    this.ftsEnabled = this.configService.get<boolean>('CATALOG_FTS_ENABLED', true);
    this.logger.log(`Full-Text Search enabled: ${this.ftsEnabled}`);
  }

  /**
   * Search products by text query
   * PR-03.5.2: Uses FTS if enabled, otherwise falls back to ILIKE
   * @param merchantId - Merchant ID (multi-tenancy)
   * @param query - Search text
   * @param limit - Maximum results (default 20)
   * @returns Array of products with available variants
   */
  async searchProducts(
    merchantId: string,
    query: string,
    limit = 20,
  ): Promise<ProductWithVariants[]> {
    this.logger.log(
      `Searching products for merchant ${merchantId} with query: "${query}" (FTS: ${this.ftsEnabled})`,
    );

    // PR-03.5.2: Conditional delegation based on feature flag
    const products = this.ftsEnabled
      ? await this.productRepository.searchFts(merchantId, query, limit)
      : await this.productRepository.search(merchantId, query, limit, true);

    this.logger.log(`Found ${products.length} products`);
    return products;
  }

  /**
   * Get product by ID
   * @param id - Product ID
   * @param merchantId - Merchant ID for multi-tenancy validation
   * @throws NotFoundException if product not found or belongs to different merchant
   */
  async getProduct(id: string, merchantId: string): Promise<ProductWithVariants> {
    const product = await this.productRepository.findById(id);

    if (!product || product.merchantId !== merchantId) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Get products by category
   * @param categoryId - Category ID
   * @param merchantId - Merchant ID for multi-tenancy validation
   * @param onlyActive - Filter active products only (default true)
   */
  async getByCategory(
    categoryId: string,
    merchantId: string,
    onlyActive = true,
  ): Promise<ProductWithVariants[]> {
    const products = await this.productRepository.findByCategory(categoryId, onlyActive);
    // Filter by merchant to enforce multi-tenancy
    return products.filter((p) => p.merchantId === merchantId);
  }

  /**
   * Get all products for a merchant
   * @param merchantId - Merchant ID
   */
  async getByMerchant(merchantId: string): Promise<ProductWithVariants[]> {
    return this.productRepository.findByMerchant(merchantId);
  }
}
