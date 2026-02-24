import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';

/**
 * ViewCartFlow
 * AC-08: Handles VIEW_CART intent
 * REQ-05: Shows cart summary in WhatsApp-friendly format
 * PR-04: Cart CRUD conversational
 */
@Injectable()
export class ViewCartFlow {
  private readonly logger = new Logger(ViewCartFlow.name);

  constructor(private readonly cartService: CartService) {}

  /**
   * AC-08: Handle VIEW_CART intent
   * REQ-05: Shows cart summary in WhatsApp-friendly format
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @returns Formatted cart summary
   */
  async execute(customerId: string, merchantId: string): Promise<string> {
    this.logger.log(`Showing cart for customer ${customerId}`);

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return `🛒 *Tu carrito está vacío*

Escribe "buscar" para explorar productos o simplemente dime qué necesitas.`;
      }

      return this.formatCartSummary(summary);
    } catch (error) {
      this.logger.error(`Failed to show cart: ${error.message}`, error.stack);
      return '❌ Error al mostrar el carrito. Intenta de nuevo.';
    }
  }

  /**
   * Format cart summary message (WhatsApp-friendly)
   */
  private formatCartSummary(summary: CartSummary): string {
    const header = `🛒 *Tu carrito* (${summary.itemCount} ${summary.itemCount === 1 ? 'producto' : 'productos'})\n\n`;

    const items = summary.items
      .map(
        (item) =>
          `📦 *${item.productName}*\n   ${item.variantName}\n   ${item.quantity}x $${item.priceSnapshot.toFixed(2)} = $${item.subtotal.toFixed(2)}`,
      )
      .join('\n\n');

    const footer = `\n\n💰 *Total: $${summary.total.toFixed(2)}*

✏️ Para modificar cantidades o remover items, escríbeme qué quieres cambiar.`;

    return header + items + footer;
  }
}
