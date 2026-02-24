import { Injectable, Logger } from '@nestjs/common';
import { CatalogService } from '../../services/catalog.service';
import { ProductWithVariants } from '../../persistence/repositories/product.repository';

/**
 * SearchCatalogFlow
 * Handles product search and formats results
 */
@Injectable()
export class SearchCatalogFlow {
  private readonly logger = new Logger(SearchCatalogFlow.name);

  constructor(private readonly catalogService: CatalogService) {}

  /**
   * Search products and format response
   *
   * @param merchantId - Merchant ID
   * @param query - Search query
   * @returns Formatted product list message
   */
  async handle(merchantId: string, query: string): Promise<string> {
    this.logger.log(`Searching catalog for merchant ${merchantId} (query length: ${query.length})`);

    // Search products (max 5 for WhatsApp readability)
    const products = await this.catalogService.searchProducts(merchantId, query, 5);

    if (products.length === 0) {
      return this.formatNoResults(query);
    }

    return this.formatResults(query, products);
  }

  /**
   * Format no results message
   */
  private formatNoResults(query: string): string {
    return `😔 No encontré productos para "${query}"

Intenta con otras palabras o escribe "ayuda" para ver opciones.`;
  }

  /**
   * Format products as WhatsApp message
   */
  private formatResults(query: string, products: ProductWithVariants[]): string {
    const header = `🔍 Resultados para "${query}":\n\n`;

    const productLines = products
      .map((product, index) => {
        const variants = product.variants.filter((v) => v.stock > 0);

        // Skip products with no stock available
        if (variants.length === 0) {
          return null;
        }

        const minPrice = Math.min(...variants.map((v) => Number(v.price)));
        const maxPrice = Math.max(...variants.map((v) => Number(v.price)));

        const priceDisplay =
          minPrice === maxPrice
            ? `$${minPrice.toFixed(2)}`
            : `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`;

        const stockDisplay = variants.reduce((sum, v) => sum + v.stock, 0);

        return `${index + 1}. *${product.name}*
   💰 ${priceDisplay}
   📦 Stock: ${stockDisplay} unidades
   ${product.description ? `   ℹ️  ${product.description.substring(0, 60)}${product.description.length > 60 ? '...' : ''}` : ''}`;
      })
      .filter((line) => line !== null);

    // If all products have zero stock after filtering
    if (productLines.length === 0) {
      return this.formatNoResults(query);
    }

    const footer = `\n\n💬 Para agregar al carrito, escribe el nombre del producto`;

    return header + productLines.join('\n\n') + footer;
  }
}
