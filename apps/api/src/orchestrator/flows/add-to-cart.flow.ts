import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';

/**
 * AddToCartFlow
 * PR-04.1: Handles guided search selection flow (select_product / product_options / view_details).
 * PR-04: Handles ADD_TO_CART intent via execute().
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class AddToCartFlow {
  private readonly logger = new Logger(AddToCartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly catalogService: CatalogService,
    private readonly playbookService: PlaybookService,
    private readonly expectingService: ExpectingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // PR-04.1: Guided search selection states (handled by orchestrator pre-check)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * PR-04.1 REQ-04..10: Handle expecting states for guided search flow.
   * Called by the orchestrator when expecting.flow === 'search_selection' and
   * type is select_product | product_options | view_details.
   *
   * Returns null if expecting has expired (caller should use searchExpired message).
   */
  async handleExpecting(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    text: string,
  ): Promise<string> {
    const expecting = await this.expectingService.getExpecting(conversationId);

    // REQ-10: TTL expired
    if (!expecting || expecting.flow !== 'search_selection') {
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'searchExpired');
    }

    switch (expecting.type) {
      case 'select_product':
        return this.handleSelectProduct(
          merchant,
          customerId,
          merchantId,
          conversationId,
          text,
          expecting.data.products ?? [],
        );

      case 'product_options':
        return this.handleProductOptions(
          merchant,
          customerId,
          merchantId,
          conversationId,
          text,
          expecting.data.selectedProduct,
        );

      case 'view_details':
        return this.handleViewDetails(
          merchant,
          customerId,
          merchantId,
          conversationId,
          text,
          expecting.data.selectedProduct,
        );

      default:
        await this.expectingService.clearExpecting(conversationId);
        return this.playbookService.getMessage(merchant, 'searchExpired');
    }
  }

  /**
   * REQ-04: User selects a product by number from list.
   * Valid number → show action menu (product_options).
   * OOB or non-numeric → invalidProductSelection.
   */
  private async handleSelectProduct(
    merchant: MerchantPlaybookData,
    _customerId: string,
    _merchantId: string,
    conversationId: string,
    text: string,
    products: Array<{ id: string; name: string; price: number; stock: number }>,
  ): Promise<string> {
    const num = this.parseNumericSelection(text);

    if (num === null || num < 1 || num > products.length) {
      return this.playbookService.getMessage(merchant, 'invalidProductSelection', {
        count: products.length,
      });
    }

    const selected = products[num - 1];

    await this.expectingService.setExpecting(conversationId, {
      flow: 'search_selection',
      type: 'product_options',
      data: { selectedProduct: { id: selected.id, name: selected.name, price: selected.price } },
      expiresAt: ExpectingService.cartSearchExpiresAt(),
    });

    return this.playbookService.getMessage(merchant, 'searchActionMenu', {
      productName: selected.name,
      price: selected.price.toFixed(2),
    });
  }

  /**
   * REQ-05/06/08: Product options menu handler.
   * 1 = add to cart, 2 = view details, 3 = cancel.
   */
  private async handleProductOptions(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    text: string,
    selectedProduct?: { id: string; name: string; price: number },
  ): Promise<string> {
    const num = this.parseNumericSelection(text);

    if (!selectedProduct) {
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'searchExpired');
    }

    if (num === 1) {
      // REQ-05: Add to cart qty=1
      return this.addProductToCart(
        merchant,
        customerId,
        merchantId,
        conversationId,
        selectedProduct,
      );
    }

    if (num === 2) {
      // REQ-06: View details
      return this.showProductDetails(merchant, merchantId, conversationId, selectedProduct);
    }

    if (num === 3) {
      // REQ-08: Cancel
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'searchCancelled');
    }

    // Invalid option — re-prompt without changing expecting
    return this.playbookService.getMessage(merchant, 'invalidProductSelection', { count: 3 });
  }

  /**
   * REQ-07/08: View details state handler.
   * 1 = add to cart, 2 = cancel.
   */
  private async handleViewDetails(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    text: string,
    selectedProduct?: { id: string; name: string; price: number },
  ): Promise<string> {
    const num = this.parseNumericSelection(text);

    if (!selectedProduct) {
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'searchExpired');
    }

    if (num === 1) {
      // REQ-07: Add to cart qty=1
      return this.addProductToCart(
        merchant,
        customerId,
        merchantId,
        conversationId,
        selectedProduct,
      );
    }

    if (num === 2) {
      // REQ-08: Cancel
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'searchCancelled');
    }

    // Invalid option — re-prompt without changing expecting
    return this.playbookService.getMessage(merchant, 'invalidProductSelection', { count: 2 });
  }

  /**
   * Shared: add product (first active variant with stock) to cart with qty=1.
   * REQ-05 / REQ-07: Quantity always = 1 (no prompt).
   */
  private async addProductToCart(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    selectedProduct: { id: string; name: string; price: number },
  ): Promise<string> {
    try {
      const products = await this.catalogService.searchProducts(
        merchantId,
        selectedProduct.name,
        5,
      );
      const product = products.find((p) => p.id === selectedProduct.id) ?? products[0];

      if (!product) {
        await this.expectingService.clearExpecting(conversationId);
        return this.playbookService.getMessage(merchant, 'productNotFound', {
          query: selectedProduct.name,
        });
      }

      // First active variant with stock (no variant selection prompt — MVP simplification)
      const variant = product.variants.find((v) => v.isActive && v.stock > 0);

      if (!variant) {
        await this.expectingService.clearExpecting(conversationId);
        return this.playbookService.getMessage(merchant, 'noStock', {
          product_name: selectedProduct.name,
        });
      }

      const updatedCart = await this.cartService.addItem(customerId, merchantId, variant.id, 1);
      const summary = await this.cartService.getCartSummary(updatedCart.id);

      await this.expectingService.clearExpecting(conversationId);

      return this.playbookService.getMessage(merchant, 'addToCartConfirm', {
        product_name: selectedProduct.name,
        variant_name: variant.name,
        price: Number(variant.price).toFixed(2),
        quantity: '1',
        total: summary.total.toFixed(2),
        cart_total: summary.total.toFixed(2),
        cart_item_count: summary.itemCount,
        cart_item_word: summary.itemCount === 1 ? 'producto' : 'productos',
      });
    } catch (error) {
      this.logger.error(
        `addProductToCart failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      if ((error as Error).message.includes('Stock insuficiente')) {
        return this.playbookService.getMessage(merchant, 'noStock', {
          product_name: selectedProduct.name,
        });
      }

      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'agregar al carrito',
      });
    }
  }

  /**
   * REQ-06: Show product details and set view_details expecting.
   * AC-06: Fetches description and stock from catalog before rendering message.
   */
  private async showProductDetails(
    merchant: MerchantPlaybookData,
    merchantId: string,
    conversationId: string,
    selectedProduct: { id: string; name: string; price: number },
  ): Promise<string> {
    await this.expectingService.setExpecting(conversationId, {
      flow: 'search_selection',
      type: 'view_details',
      data: { selectedProduct },
      expiresAt: ExpectingService.cartSearchExpiresAt(),
    });

    // REQ-06/AC-06: lookup description and stock from catalog
    let description = '';
    let stock = '';
    try {
      const products = await this.catalogService.searchProducts(
        merchantId,
        selectedProduct.name,
        5,
      );
      const product = products.find((p) => p.id === selectedProduct.id) ?? products[0];
      if (product) {
        description = product.description ?? '';
        const totalStock = product.variants
          .filter((v) => v.stock > 0)
          .reduce((sum, v) => sum + v.stock, 0);
        stock = String(totalStock);
      }
    } catch (error) {
      this.logger.warn(
        `showProductDetails catalog lookup failed: ${(error as Error).message}`,
      );
    }

    return this.playbookService.getMessage(merchant, 'searchViewDetails', {
      productName: selectedProduct.name,
      description,
      stock,
      price: selectedProduct.price.toFixed(2),
    });
  }

  /**
   * Parse a 1-based numeric selection from user text.
   * Returns null for non-numeric or invalid inputs.
   */
  private parseNumericSelection(text: string): number | null {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = parseInt(trimmed, 10);
    return isNaN(n) ? null : n;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PR-04: Legacy ADD_TO_CART intent handler (direct product query)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * AC-07: Handle ADD_TO_CART intent (direct "agregar camiseta roja")
   *
   * @param merchant     - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   * @param customerId   - Customer ID
   * @param merchantId   - Merchant ID
   * @param productQuery - Product name/description extracted from message
   * @param fullText     - Full message text for quantity extraction
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
      const products = await this.catalogService.searchProducts(merchantId, productQuery, 5);

      if (products.length === 0) {
        return this.playbookService.getMessage(merchant, 'productNotFound', {
          query: productQuery,
        });
      }

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

      const product = products[0];
      const availableVariants = product.variants.filter((v) => v.stock > 0 && v.isActive);

      if (availableVariants.length === 0) {
        return this.playbookService.getMessage(merchant, 'noStock', {
          product_name: product.name,
        });
      }

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

      const variant = availableVariants[0];
      const updatedCart = await this.cartService.addItem(
        customerId,
        merchantId,
        variant.id,
        quantity,
      );

      const summary = await this.cartService.getCartSummary(updatedCart.id);

      return this.formatAddConfirmation(
        merchant,
        product.name,
        variant.name,
        variant.price.toNumber(),
        summary,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add to cart: ${(error as Error).message}`,
        (error as Error).stack,
      );

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
