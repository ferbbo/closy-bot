import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * RemoveFromCartFlow
 * AC-10: Handles REMOVE_FROM_CART intent
 * REQ-07: Removes item from cart by product name/position
 * PR-04: Cart CRUD conversational
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class RemoveFromCartFlow {
  private readonly logger = new Logger(RemoveFromCartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * @param merchant     - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   * @param customerId   - Customer ID
   * @param merchantId   - Merchant ID
   * @param productQuery - Product name extracted from message
   */
  async execute(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    productQuery: string,
  ): Promise<string> {
    this.logger.log(`Removing from cart for customer ${customerId}`);

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return this.playbookService.getMessage(merchant, 'cartEmptyNoAction', {
          action: 'remover',
        });
      }

      // Find matching item in cart
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

      // Remove item
      await this.cartService.removeItem(cart.id, matchingItem.id);

      // Get updated summary
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
      this.logger.error(
        `Failed to remove item: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return this.playbookService.getMessage(merchant, 'genericError', { action: 'remover item' });
    }
  }
}
