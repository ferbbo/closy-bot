import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';
import { formatNumberedList } from '../../common/helpers/selection-helpers';

/**
 * ViewCartFlow
 * PR-04.2: Rewritten — shows numbered list with management instructions + sets expecting.
 * PR-04: Cart CRUD conversational
 * PR-GAP-1: All user-facing messages via PlaybookService.getMessage()
 */
@Injectable()
export class ViewCartFlow {
  private readonly logger = new Logger(ViewCartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly playbookService: PlaybookService,
    private readonly expectingService: ExpectingService,
  ) {}

  /**
   * AC-03: Show numbered cart list with management instructions + set expecting(select_action).
   * AC-12: Empty cart → return cartEmpty message without setting expecting.
   *
   * Used for both VIEW_CART and MANAGE_CART intents.
   *
   * @param merchant - Merchant playbook data
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param conversationId - Conversation ID (required for ExpectingService)
   */
  async execute(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
  ): Promise<string> {
    this.logger.log(`ViewCartFlow: listing cart for customer ${customerId}`);

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      // AC-12: Empty cart — no expecting set
      if (summary.items.length === 0) {
        return this.playbookService.getMessage(merchant, 'cartEmpty');
      }

      // Build snapshot for expecting state data
      const cartItems = summary.items.map((item) => ({
        id: item.id,
        name: item.productName,
        qty: item.quantity,
      }));

      // Build numbered list display
      const itemLines = summary.items.map(
        (item) =>
          `*${item.productName}* - ${item.variantName} (x${item.quantity}) - $${item.priceSnapshot.toFixed(2)}`,
      );
      const lista = formatNumberedList(itemLines);

      // AC-03: Show cartListWithActions message
      const message = this.playbookService.getMessage(merchant, 'cartListWithActions', { lista });

      // AC-04: Set expecting(cart_management/select_action)
      await this.expectingService.setExpecting(conversationId, {
        flow: 'cart_management',
        type: 'select_action',
        data: { cartItems },
        expiresAt: ExpectingService.cartSearchExpiresAt(),
      });

      this.logger.debug(
        `ViewCartFlow: setExpecting select_action for conv=${conversationId} (${cartItems.length} items)`,
      );

      return message;
    } catch (error) {
      this.logger.error(
        `ViewCartFlow: failed — ${(error as Error).message}`,
        (error as Error).stack,
      );
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'mostrar el carrito',
      });
    }
  }
}
