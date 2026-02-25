import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * ViewCartFlow
 * AC-08: Handles VIEW_CART intent
 * REQ-05: Shows cart summary in WhatsApp-friendly format
 * PR-04: Cart CRUD conversational
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class ViewCartFlow {
  private readonly logger = new Logger(ViewCartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * AC-08: Handle VIEW_CART intent
   * REQ-05: Shows cart summary in WhatsApp-friendly format
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @returns Formatted cart summary
   */
  /**
   * @param merchant  - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   */
  async execute(
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
      this.logger.error(`Failed to show cart: ${(error as Error).message}`, (error as Error).stack);
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'mostrar el carrito',
      });
    }
  }

  /**
   * Format cart summary message (WhatsApp-friendly)
   */
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
