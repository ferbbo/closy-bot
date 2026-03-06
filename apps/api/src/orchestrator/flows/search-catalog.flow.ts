import { Injectable, Logger } from '@nestjs/common';
import { CatalogService } from '../../services/catalog.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ProductWithVariants } from '../../persistence/repositories/product.repository';

/**
 * SearchCatalogFlow
 * Handles product search and formats results
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class SearchCatalogFlow {
  private readonly logger = new Logger(SearchCatalogFlow.name);

  /**
   * Intent keywords to strip from search queries.
   * These are words that indicate search intent but aren't part of the product query.
   */
  private readonly INTENT_KEYWORDS = [
    // Spanish search intent
    'busco',
    'buscando',
    'quiero',
    'necesito',
    'tienes',
    'tiene',
    'tienen',
    'hay',
    'me puedes mostrar',
    'me muestras',
    'muéstrame',
    'muestrame',
    'puedes mostrarme',
    'dame',
    'ver',
    'enseñame',
    'enséñame',
    'que tengas',
    'que tenga',
    // English search intent
    'looking for',
    'i want',
    'i need',
    'do you have',
    'show me',
  ];

  constructor(
    private readonly catalogService: CatalogService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * Sanitize query by removing intent keywords and punctuation
   * "tienes jeans azul?" → "jeans azul"
   * "busco camisas blancas" → "camisas blancas"
   * "y camisa blanca" → "camisa blanca" (continuation)
   */
  private sanitizeQuery(rawQuery: string): string {
    let query = rawQuery.toLowerCase().trim();

    // Remove leading/trailing punctuation (¿?, ¡!, etc.)
    query = query.replace(/^[¿¡]+|[?!.,:;]+$/g, '').trim();

    // Remove leading conjunctions (continuation messages: "y camisa blanca" → "camisa blanca")
    query = query.replace(/^(y|e|o|también|además)\s+/i, '').trim();

    // Remove intent keywords (sorted by length descending to match longer phrases first)
    const sortedKeywords = [...this.INTENT_KEYWORDS].sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
      // Match keyword at start of query (with possible leading whitespace after)
      const pattern = new RegExp(`^${keyword}\\s*`, 'i');
      query = query.replace(pattern, '');
    }

    return query.trim();
  }

  /**
   * Split multi-product query into individual product searches
   * "camisas blancas, jeans azules y vestido floral" → ["camisas blancas", "jeans azules", "vestido floral"]
   */
  private splitMultiProductQuery(query: string): string[] {
    // Split by common separators: comma, " y ", " o ", " e " (Spanish conjunctions)
    const parts = query
      .split(/,|\s+y\s+|\s+o\s+|\s+e\s+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2); // Filter out empty or too short parts

    return parts.length > 0 ? parts : [query];
  }

  /**
   * @param merchant  - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   * @param merchantId - Merchant ID
   * @param query     - Search query (raw user input, may include intent keywords)
   */
  async handle(merchant: MerchantPlaybookData, merchantId: string, query: string): Promise<string> {
    const sanitizedQuery = this.sanitizeQuery(query);
    const subQueries = this.splitMultiProductQuery(sanitizedQuery);

    this.logger.log(
      `Searching catalog for merchant ${merchantId} (raw: "${query}" → sanitized: "${sanitizedQuery}" → subQueries: ${subQueries.length})`,
    );

    // If multiple sub-queries, search each and combine results
    if (subQueries.length > 1) {
      return this.handleMultiSearch(merchant, merchantId, subQueries);
    }

    // Single product search (max 5 for WhatsApp readability)
    const products = await this.catalogService.searchProducts(merchantId, sanitizedQuery, 5);

    if (products.length === 0) {
      return this.playbookService.getMessage(merchant, 'searchNoResults', { query: sanitizedQuery });
    }

    return this.formatResults(merchant, sanitizedQuery, products);
  }

  /**
   * Handle multi-product search: search each sub-query and combine results
   */
  private async handleMultiSearch(
    merchant: MerchantPlaybookData,
    merchantId: string,
    subQueries: string[],
  ): Promise<string> {
    const allProducts: ProductWithVariants[] = [];
    const seenProductIds = new Set<string>();
    const foundQueries: string[] = [];
    const notFoundQueries: string[] = [];

    // Search each sub-query (limit 2 per sub-query to avoid overwhelming)
    for (const subQuery of subQueries) {
      const products = await this.catalogService.searchProducts(merchantId, subQuery, 2);

      if (products.length > 0) {
        foundQueries.push(subQuery);
        for (const product of products) {
          // Deduplicate by product ID
          if (!seenProductIds.has(product.id)) {
            seenProductIds.add(product.id);
            allProducts.push(product);
          }
        }
      } else {
        notFoundQueries.push(subQuery);
      }
    }

    // Build response
    if (allProducts.length === 0) {
      return this.playbookService.getMessage(merchant, 'searchNoResults', {
        query: subQueries.join(', '),
      });
    }

    // Limit total to 5 products for readability
    const limitedProducts = allProducts.slice(0, 5);
    const displayQuery = foundQueries.join(', ');

    let response = this.formatResults(merchant, displayQuery, limitedProducts);

    // Add note about not-found items
    if (notFoundQueries.length > 0) {
      response += `\n\n_No encontré: ${notFoundQueries.join(', ')}_`;
    }

    return response;
  }

  /**
   * Format products as WhatsApp message
   */
  private formatResults(
    merchant: MerchantPlaybookData,
    query: string,
    products: ProductWithVariants[],
  ): string {
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
      return this.playbookService.getMessage(merchant, 'searchNoResults', { query });
    }

    const header = this.playbookService.getMessage(merchant, 'searchResultsHeader', {
      query,
      count: productLines.length,
    });
    const footer = this.playbookService.getMessage(merchant, 'searchResultsFooter');

    return header + productLines.join('\n\n') + footer;
  }
}
