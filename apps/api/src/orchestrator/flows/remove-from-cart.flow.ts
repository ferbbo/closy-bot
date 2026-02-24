import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../services/cart.service';

/**
 * RemoveFromCartFlow
 * AC-10: Handles REMOVE_FROM_CART intent
 * REQ-07: Removes item from cart by product name/position
 * PR-04: Cart CRUD conversational
 */
@Injectable()
export class RemoveFromCartFlow {
  private readonly logger = new Logger(RemoveFromCartFlow.name);

  constructor(private readonly cartService: CartService) {}

  /**
   * AC-10: Handle REMOVE_FROM_CART intent
   * REQ-07: Detects item, removes, responds confirmation
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param productQuery - Product name extracted from message
   * @returns Formatted response message
   */
  async execute(customerId: string, merchantId: string, productQuery: string): Promise<string> {
    this.logger.log(`Removing from cart for customer ${customerId}: "${productQuery}"`);

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return `🛒 Tu carrito está vacío, no hay nada que remover.`;
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
        return `No encontré "${productQuery}" en tu carrito.\n\nTu carrito tiene:\n${itemsList}\n\n¿Cuál quieres remover?`;
      }

      // Remove item
      await this.cartService.removeItem(cart.id, matchingItem.id);

      // Get updated summary
      const updatedSummary = await this.cartService.getCartSummary(cart.id);

      return `✅ *${matchingItem.productName} - ${matchingItem.variantName}* removido del carrito

${updatedSummary.items.length > 0 ? `Total actualizado: *$${updatedSummary.total.toFixed(2)}*` : '🛒 Tu carrito ahora está vacío'}`;
    } catch (error) {
      this.logger.error(`Failed to remove item: ${error.message}`, error.stack);
      return '❌ Error al remover item. Intenta de nuevo.';
    }
  }
}
