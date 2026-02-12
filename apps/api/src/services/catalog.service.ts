import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  /**
   * Search products by text query
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
    this.logger.log(`Searching products for merchant ${merchantId} with query: "${query}"`);

    const products = await this.productRepository.search(
      merchantId,
      query,
      limit,
      true, // Only available products
    );

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
