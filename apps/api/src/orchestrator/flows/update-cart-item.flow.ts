import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../services/cart.service';

/**
 * UpdateCartItemFlow
 * AC-09: Handles UPDATE_CART intent
 * REQ-06: Updates quantity of existing cart item (1-99)
 * PR-04: Cart CRUD conversational
 */
@Injectable()
export class UpdateCartItemFlow {
  private readonly logger = new Logger(UpdateCartItemFlow.name);

  constructor(private readonly cartService: CartService) {}

  /**
   * AC-09: Handle UPDATE_CART intent
   * REQ-06: Updates quantity of existing cart item (1-99)
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param productQuery - Product name extracted from message
   * @param quantity - New quantity (extracted from message text)
   * @returns Formatted response message
   */
  async execute(
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
        return `🛒 Tu carrito está vacío, no hay nada que actualizar.`;
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
        return `No encontré "${productQuery}" en tu carrito.\n\nTu carrito tiene:\n${itemsList}\n\n¿Cuál quieres actualizar?`;
      }

      // Validate quantity
      if (quantity < 1 || quantity > 99) {
        return `❌ La cantidad debe estar entre 1 y 99 unidades.`;
      }

      // Update quantity
      await this.cartService.updateQuantity(cart.id, matchingItem.id, quantity);

      // Get updated summary
      const updatedSummary = await this.cartService.getCartSummary(cart.id);

      return `✅ *Cantidad actualizada*

📦 ${matchingItem.productName} - ${matchingItem.variantName}
➡️ Ahora tienes ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}

🛒 Total: *$${updatedSummary.total.toFixed(2)}*`;
    } catch (error) {
      this.logger.error(`Failed to update quantity: ${error.message}`, error.stack);

      // Handle stock validation errors gracefully
      if (error.message.includes('Stock insuficiente')) {
        return `😔 ${error.message}`;
      }

      return '❌ Error al actualizar cantidad. Intenta de nuevo.';
    }
  }
}
