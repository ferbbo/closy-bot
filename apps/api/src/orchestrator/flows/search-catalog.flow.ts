import { Injectable, Logger } from '@nestjs/common';
import { CatalogService } from '../../services/catalog.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';
import { ProductWithVariants } from '../../persistence/repositories/product.repository';

const PAGE_SIZE = 5;

/**
 * SearchCatalogFlow
 * PR-04.1: Guided search → paginated list → setExpecting(select_product)
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class SearchCatalogFlow {
  private readonly logger = new Logger(SearchCatalogFlow.name);

  /**
   * Intent keywords to strip from search queries.
   * PR-04.1 constraint: 'buscar' added to fix keyword drift (sanitize "buscar camiseta" → "camiseta").
   */
  private readonly INTENT_KEYWORDS = [
    // Spanish search intent
    'buscar',
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
    private readonly expectingService: ExpectingService,
  ) {}

  /**
   * Sanitize query by removing intent keywords and punctuation
   * "tienes jeans azul?" → "jeans azul"
   * "buscar camiseta" → "camiseta"  (PR-04.1: 'buscar' now in INTENT_KEYWORDS)
   */
  private sanitizeQuery(rawQuery: string): string {
    let query = rawQuery.toLowerCase().trim();

    // Remove leading/trailing punctuation (¿?, ¡!, etc.)
    query = query.replace(/^[¿¡]+|[?!.,:;]+$/g, '').trim();

    // Remove leading conjunctions (continuation messages: "y camisa blanca" → "camisa blanca")
    query = query.replace(/^(y|e|o|también|además)\s+/i, '').trim();

    // Remove trailing courtesy phrases: "por favor", "porfavor", "porfa", "gracias", "plis", "please"
    query = query
      .replace(/\s+(por\s*favor|porfavor|porfa|gracias|plis|please|xfa|xfavor)$/i, '')
      .trim();

    // Remove intent keywords (sorted by length descending to match longer phrases first)
    const sortedKeywords = [...this.INTENT_KEYWORDS].sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
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
    const parts = query
      .split(/,|\s+y\s+|\s+o\s+|\s+e\s+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);

    return parts.length > 0 ? parts : [query];
  }

  /**
   * Fetch a page of products and detect whether there are more.
   * Fetches PAGE_SIZE + 1 results and trims to PAGE_SIZE to detect hasMore.
   */
  private async fetchPage(
    merchantId: string,
    query: string,
    page: number,
  ): Promise<{ products: ProductWithVariants[]; hasMore: boolean }> {
    const fetchLimit = page * PAGE_SIZE + 1; // e.g., page=1 → 6, page=2 → 11
    const allResults = await this.catalogService.searchProducts(merchantId, query, fetchLimit);
    const pageStart = (page - 1) * PAGE_SIZE;
    const pageEnd = page * PAGE_SIZE;
    const products = allResults.slice(pageStart, pageEnd);
    const hasMore = allResults.length > pageEnd;
    return { products, hasMore };
  }

  /**
   * PR-04.1 REQ-11: Handle message from ask_search_query state.
   * Treats rawText as the product search query directly.
   */
  async handleAskSearchQueryReply(
    merchant: MerchantPlaybookData,
    merchantId: string,
    rawText: string,
    conversationId: string,
  ): Promise<string> {
    const query = rawText.trim();
    if (!query) {
      return this.playbookService.getMessage(merchant, 'searchAskKeyword');
    }
    return this.searchAndRespond(merchant, merchantId, query, conversationId, 1);
  }

  /**
   * PR-04.1 REQ-03: Handle "siguiente" keyword within select_product expecting state.
   */
  async handleNextPage(
    merchant: MerchantPlaybookData,
    merchantId: string,
    conversationId: string,
  ): Promise<string> {
    const expecting = await this.expectingService.getExpecting(conversationId);
    if (
      !expecting ||
      expecting.flow !== 'search_selection' ||
      expecting.type !== 'select_product'
    ) {
      return this.playbookService.getMessage(merchant, 'searchExpired');
    }

    if (!expecting.data.hasMore) {
      return this.playbookService.getMessage(merchant, 'searchNoMorePages');
    }

    const currentPage = expecting.data.page ?? 1;
    const nextPage = currentPage + 1;
    const query = expecting.data.searchQuery ?? '';

    if (!query) {
      return this.playbookService.getMessage(merchant, 'searchExpired');
    }

    return this.searchAndRespond(merchant, merchantId, query, conversationId, nextPage);
  }

  /**
   * Core search + respond logic: fetches page, formats list, sets expecting.
   */
  private async searchAndRespond(
    merchant: MerchantPlaybookData,
    merchantId: string,
    query: string,
    conversationId: string,
    page: number,
  ): Promise<string> {
    const { products, hasMore } = await this.fetchPage(merchantId, query, page);

    // Filter out products with no stock
    const available = products.filter((p) => p.variants.some((v) => v.stock > 0));

    if (available.length === 0) {
      return this.playbookService.getMessage(merchant, 'searchNoResults', { query });
    }

    // Persist expecting state with current page snapshot
    const productData = available.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.variants.length > 0 ? Math.min(...p.variants.map((v) => Number(v.price))) : 0,
      stock: p.variants.reduce((sum, v) => sum + v.stock, 0),
    }));

    await this.expectingService.setExpecting(conversationId, {
      flow: 'search_selection',
      type: 'select_product',
      data: { products: productData, page, hasMore, searchQuery: query },
      expiresAt: ExpectingService.cartSearchExpiresAt(),
    });

    this.logger.debug(
      `SearchCatalogFlow: setExpecting select_product conv=${conversationId} page=${page} hasMore=${hasMore}`,
    );

    return this.formatResults(merchant, query, available, hasMore);
  }

  /**
   * Main entry point.
   * PR-04.1:
   *  - sanitizedQuery === "" → ask_search_query expecting + searchAskKeyword
   *  - "siguiente" in select_product → next page
   *  - sanitizedQuery !== "" → search + list + select_product expecting
   *  - multi-product query → combined results (no pagination)
   *
   * @param merchant        - Merchant data for playbook messages
   * @param merchantId      - Merchant ID
   * @param query           - Raw user message
   * @param conversationId  - Required for ExpectingService state
   */
  async handle(
    merchant: MerchantPlaybookData,
    merchantId: string,
    query: string,
    conversationId?: string,
  ): Promise<string> {
    const sanitizedQuery = this.sanitizeQuery(query);

    this.logger.log(
      `SearchCatalogFlow: merchant=${merchantId} raw="${query}" sanitized="${sanitizedQuery}"`,
    );

    // PR-04.1 REQ-01: Empty query after sanitization → ask user for keyword
    if (sanitizedQuery === '') {
      if (conversationId) {
        await this.expectingService.setExpecting(conversationId, {
          flow: 'search_selection',
          type: 'ask_search_query',
          data: {},
          expiresAt: ExpectingService.cartSearchExpiresAt(),
        });
      }
      return this.playbookService.getMessage(merchant, 'searchAskKeyword');
    }

    // PR-04.1 REQ-03: "siguiente" keyword — handled at orchestrator level via handleNextPage().
    // This path handles single/multi-product searches.

    const subQueries = this.splitMultiProductQuery(sanitizedQuery);

    // Multi-product search: no pagination, no expecting
    if (subQueries.length > 1) {
      return this.handleMultiSearch(merchant, merchantId, subQueries);
    }

    // Single product search with pagination support
    if (conversationId) {
      return this.searchAndRespond(merchant, merchantId, sanitizedQuery, conversationId, 1);
    }

    // No conversationId fallback (legacy callers without expecting)
    const products = await this.catalogService.searchProducts(
      merchantId,
      sanitizedQuery,
      PAGE_SIZE,
    );
    if (products.length === 0) {
      return this.playbookService.getMessage(merchant, 'searchNoResults', {
        query: sanitizedQuery,
      });
    }
    return this.formatResults(merchant, sanitizedQuery, products, false);
  }

  /**
   * Handle multi-product search: search each sub-query and combine results (no pagination)
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

    for (const subQuery of subQueries) {
      const products = await this.catalogService.searchProducts(merchantId, subQuery, 2);

      if (products.length > 0) {
        foundQueries.push(subQuery);
        for (const product of products) {
          if (!seenProductIds.has(product.id)) {
            seenProductIds.add(product.id);
            allProducts.push(product);
          }
        }
      } else {
        notFoundQueries.push(subQuery);
      }
    }

    if (allProducts.length === 0) {
      return this.playbookService.getMessage(merchant, 'searchNoResults', {
        query: subQueries.join(', '),
      });
    }

    const limitedProducts = allProducts.slice(0, PAGE_SIZE);
    const displayQuery = foundQueries.join(', ');

    let response = this.formatResults(merchant, displayQuery, limitedProducts, false);

    if (notFoundQueries.length > 0) {
      response += `\n\n_No encontré: ${notFoundQueries.join(', ')}_`;
    }

    return response;
  }

  /**
   * Format products as WhatsApp numbered list with optional "siguiente" hint.
   */
  private formatResults(
    merchant: MerchantPlaybookData,
    query: string,
    products: ProductWithVariants[],
    hasMore: boolean,
  ): string {
    const productLines = products
      .map((product, index) => {
        const variants = product.variants.filter((v) => v.stock > 0);

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

    if (productLines.length === 0) {
      return this.playbookService.getMessage(merchant, 'searchNoResults', { query });
    }

    const header = this.playbookService.getMessage(merchant, 'searchResultsHeader', {
      query,
      count: productLines.length,
    });

    const nextHint = hasMore ? this.playbookService.getMessage(merchant, 'searchNextHint') : '';

    const footer = this.playbookService.getMessage(merchant, 'searchResultsFooter');

    return header + productLines.join('\n\n') + footer + nextHint;
  }
}
