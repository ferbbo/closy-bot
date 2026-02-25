import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * UpdateCartItemFlow
 * AC-09: Handles UPDATE_CART intent
 * REQ-06: Updates quantity of existing cart item (1-99)
 * PR-04: Cart CRUD conversational
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class UpdateCartItemFlow {
  private readonly logger = new Logger(UpdateCartItemFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * @param merchant     - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   * @param customerId   - Customer ID
   * @param merchantId   - Merchant ID
   * @param productQuery - Product name extracted from message
   * @param quantity     - New quantity (extracted from message text)
   */
  async execute(
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

      // Validate quantity
      if (quantity < 1 || quantity > 99) {
        return this.playbookService.getMessage(merchant, 'quantityInvalid');
      }

      // Update quantity
      await this.cartService.updateQuantity(cart.id, matchingItem.id, quantity);

      return this.playbookService.getMessage(merchant, 'updateConfirm', {
        product_name: matchingItem.productName,
        quantity: String(quantity),
      });
    } catch (error) {
      this.logger.error(`Failed to update quantity: ${(error as Error).message}`, (error as Error).stack);

      // Handle stock validation errors gracefully
      if ((error as Error).message.includes('Stock insuficiente')) {
        return this.playbookService.getMessage(merchant, 'noStock', { product_name: '' });
      }

      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'actualizar cantidad',
      });
    }
  }
}
