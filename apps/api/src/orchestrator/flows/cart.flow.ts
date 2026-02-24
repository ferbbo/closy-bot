import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * CartFlow
 * Handles conversational cart operations (add, view, update, remove)
 * PR-04: Cart CRUD conversational
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class CartFlow {
  private readonly logger = new Logger(CartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly catalogService: CatalogService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * AC-10: Handle ADD_TO_CART intent
   * REQ-09: Detects product/variant, adds to cart, responds confirmation
   * PR-GAP-1: Uses PlaybookService.getMessage()
   */
  async handleAddToCart(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    productQuery: string,
    fullText?: string,
  ): Promise<string> {
    this.logger.log(`Adding to cart for customer ${customerId}: "${productQuery}"`);

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
        return this.playbookService.getMessage(merchant, 'noStock', { product_name: product.name });
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
      this.logger.error(`Failed to add to cart: ${error.message}`, error.stack);
      if (error.message.includes('Stock insuficiente')) {
        return this.playbookService.getMessage(merchant, 'noStock', { product_name: '' });
      }
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'agregar al carrito',
      });
    }
  }

  /**
   * AC-08: Handle VIEW_CART intent
   * REQ-05: Shows cart summary in WhatsApp-friendly format
   * PR-GAP-1: Uses PlaybookService.getMessage()
   */
  async handleShowCart(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
  ): Promise<string> {
    this.logger.log(`Showing cart for customer ${customerId}`);

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return this.playbookService.getMessage(merchant, 'cartEmpty');
      }

      return this.formatCartSummary(merchant, summary);
    } catch (error) {
      this.logger.error(`Failed to show cart: ${error.message}`, error.stack);
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'mostrar el carrito',
      });
    }
  }

  /**
   * AC-12: Handle REMOVE_FROM_CART intent
   * REQ-11: Detects item, removes, responds confirmation
   * PR-GAP-1: Uses PlaybookService.getMessage()
   */
  async handleRemoveItem(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    productQuery: string,
  ): Promise<string> {
    this.logger.log(`Removing from cart for customer ${customerId}: "${productQuery}"`);

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return this.playbookService.getMessage(merchant, 'cartEmptyNoAction', {
          action: 'remover',
        });
      }

      const matchingItem = summary.items.find(
        (item) =>
          item.productName.toLowerCase().includes(productQuery.toLowerCase()) ||
          item.variantName.toLowerCase().includes(productQuery.toLowerCase()),
      );

      if (!matchingItem) {
        const itemsList = summary.items
          .map((item, i) => `${i + 1}. ${item.productName} - ${item.variantName}`)
          .join('\n');
        return this.playbookService.getMessage(merchant, 'itemNotInCart', {
          query: productQuery,
          items_list: itemsList,
        });
      }

      await this.cartService.removeItem(cart.id, matchingItem.id);
      const updatedSummary = await this.cartService.getCartSummary(cart.id);

      const confirmation = this.playbookService.getMessage(merchant, 'removeConfirm', {
        product_name: matchingItem.productName,
        variant_name: matchingItem.variantName,
      });

      const postRemove =
        updatedSummary.items.length > 0
          ? `Total actualizado: *$${updatedSummary.total.toFixed(2)}*`
          : this.playbookService.getMessage(merchant, 'cartEmpty');

      return `${confirmation}\n\n${postRemove}`;
    } catch (error) {
      this.logger.error(`Failed to remove item: ${error.message}`, error.stack);
      return this.playbookService.getMessage(merchant, 'genericError', { action: 'remover item' });
    }
  }

  /**
   * AC-09: Handle UPDATE_CART intent
   * REQ-06: Updates quantity of existing cart item (1-99)
   * PR-GAP-1: Uses PlaybookService.getMessage()
   */
  async handleUpdateQuantity(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    productQuery: string,
    quantity: number,
  ): Promise<string> {
    this.logger.log(
      `Updating cart quantity for customer ${customerId}: "${productQuery}" -> ${quantity}`,
    );

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return this.playbookService.getMessage(merchant, 'cartEmptyNoAction', {
          action: 'actualizar',
        });
      }

      const matchingItem = summary.items.find(
        (item) =>
          item.productName.toLowerCase().includes(productQuery.toLowerCase()) ||
          item.variantName.toLowerCase().includes(productQuery.toLowerCase()),
      );

      if (!matchingItem) {
        const itemsList = summary.items
          .map((item, i) => `${i + 1}. ${item.productName} - ${item.variantName}`)
          .join('\n');
        return this.playbookService.getMessage(merchant, 'itemNotInCart', {
          query: productQuery,
          items_list: itemsList,
        });
      }

      if (quantity < 1 || quantity > 99) {
        return this.playbookService.getMessage(merchant, 'quantityInvalid');
      }

      await this.cartService.updateQuantity(cart.id, matchingItem.id, quantity);

      return this.playbookService.getMessage(merchant, 'updateConfirm', {
        product_name: matchingItem.productName,
        quantity: String(quantity),
      });
    } catch (error) {
      this.logger.error(`Failed to update quantity: ${error.message}`, error.stack);
      if (error.message.includes('Stock insuficiente')) {
        return this.playbookService.getMessage(merchant, 'noStock', { product_name: '' });
      }
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'actualizar cantidad',
      });
    }
  }

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

  private formatCartSummary(merchant: MerchantPlaybookData, summary: CartSummary): string {
    const header = this.playbookService.getMessage(merchant, 'cartSummaryHeader', {
      item_count: summary.itemCount,
      item_word: summary.itemCount === 1 ? 'producto' : 'productos',
    });

    const items = summary.items
      .map(
        (item) =>
          `📦 *${item.productName}*\n   ${item.variantName}\n   ${item.quantity}x $${item.priceSnapshot.toFixed(2)} = $${item.subtotal.toFixed(2)}`,
      )
      .join('\n\n');

    const footer = this.playbookService.getMessage(merchant, 'cartSummaryFooter', {
      total: summary.total.toFixed(2),
    });

    return header + items + footer;
  }
}
