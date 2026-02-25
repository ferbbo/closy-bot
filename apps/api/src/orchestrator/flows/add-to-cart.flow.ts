import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * AddToCartFlow
 * AC-07: Handles ADD_TO_CART intent
 * REQ-04: Detects product/variant, adds to cart, responds confirmation
 * PR-04: Cart CRUD conversational
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class AddToCartFlow {
  private readonly logger = new Logger(AddToCartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly catalogService: CatalogService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * AC-07: Handle ADD_TO_CART intent
   *
   * @param merchant     - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   * @param customerId   - Customer ID
   * @param merchantId   - Merchant ID
   * @param productQuery - Product name/description extracted from message
   * @param fullText     - Full message text for quantity extraction
   * @returns Formatted response message
   */
  async execute(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    productQuery: string,
    fullText?: string,
  ): Promise<string> {
    this.logger.log(
      `Adding to cart for customer ${customerId} (query length: ${productQuery.length})`,
    );

    // Extract quantity from message (e.g., "quiero 2 camisas", "agregar 5", default 1)
    const quantityMatch = fullText?.match(/\b(\d+)\b/);
    const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

    // Validate quantity range
    if (quantity < 1 || quantity > 99) {
      return this.playbookService.getMessage(merchant, 'quantityInvalid');
    }

    try {
      // Search for product matching query
      const products = await this.catalogService.searchProducts(merchantId, productQuery, 5);

      if (products.length === 0) {
        return this.playbookService.getMessage(merchant, 'productNotFound', {
          query: productQuery,
        });
      }

      // If multiple products found, ask for clarification
      if (products.length > 1) {
        const productList = products
          .map((p, i) => {
            const variants = p.variants.filter((v) => v.stock > 0);
            const minPrice = Math.min(...variants.map((v) => Number(v.price)));
            return `${i + 1}. ${p.name} - $${minPrice.toFixed(2)}`;
          })
          .join('\n');

        return this.playbookService.getMessage(merchant, 'productMultipleOptions', {
          product_list: productList,
        });
      }

      // Single product found - add first available variant
      const product = products[0];
      const availableVariants = product.variants.filter((v) => v.stock > 0 && v.isActive);

      if (availableVariants.length === 0) {
        return this.playbookService.getMessage(merchant, 'noStock', {
          product_name: product.name,
        });
      }

      // If multiple variants, ask for clarification
      if (availableVariants.length > 1) {
        const variantList = availableVariants
          .map(
            (v, i) =>
              `${i + 1}. ${v.name} - $${Number(v.price).toFixed(2)} (${v.stock} disponibles)`,
          )
          .join('\n');

        return this.playbookService.getMessage(merchant, 'variantMultipleOptions', {
          product_name: product.name,
          variant_list: variantList,
        });
      }

      // Add single variant to cart with parsed quantity (AC-04: addItem creates cart if needed)
      const variant = availableVariants[0];
      const updatedCart = await this.cartService.addItem(
        customerId,
        merchantId,
        variant.id,
        quantity,
      );

      // Get updated cart summary
      const summary = await this.cartService.getCartSummary(updatedCart.id);

      return this.formatAddConfirmation(
        merchant,
        product.name,
        variant.name,
        variant.price.toNumber(),
        summary,
      );
    } catch (error) {
      this.logger.error(`Failed to add to cart: ${(error as Error).message}`, (error as Error).stack);

      // Handle stock validation errors gracefully
      if ((error as Error).message.includes('Stock insuficiente')) {
        return this.playbookService.getMessage(merchant, 'noStock', { product_name: '' });
      }

      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'agregar al carrito',
      });
    }
  }

  /**
   * Format add confirmation using playbook addToCartConfirm template (PR-GAP-1)
   * All emojis and text come from the playbook template — zero hardcode.
   */
  private formatAddConfirmation(
    merchant: MerchantPlaybookData,
    productName: string,
    variantName: string,
    price: number,
    summary: CartSummary,
  ): string {
    return this.playbookService.getMessage(merchant, 'addToCartConfirm', {
      product_name: productName,
      variant_name: variantName,
      price: price.toFixed(2),
      quantity: String(summary.itemCount),
      total: summary.total.toFixed(2),
      cart_total: summary.total.toFixed(2),
      cart_item_count: summary.itemCount,
      cart_item_word: summary.itemCount === 1 ? 'producto' : 'productos',
    });
  }
}
