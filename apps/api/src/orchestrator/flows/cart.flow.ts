import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';

/**
 * CartFlow
 * Handles conversational cart operations (add, view, update, remove)
 * PR-04: Cart CRUD conversational
 */
@Injectable()
export class CartFlow {
  private readonly logger = new Logger(CartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * AC-10: Handle ADD_TO_CART intent
   * REQ-09: Detects product/variant, adds to cart, responds confirmation
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param productQuery - Product name/description extracted from message
   * @param fullText - Full message text for quantity extraction
   * @returns Formatted response message
   */
  async handleAddToCart(
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
      return `❌ La cantidad debe estar entre 1 y 99 unidades.`;
    }

    try {
      // Search for product matching query
      const products = await this.catalogService.searchProducts(merchantId, productQuery, 5);

      if (products.length === 0) {
        return `😔 No encontré "${productQuery}"\n\nEscribe "buscar" para ver el catálogo.`;
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

        return `Encontré varias opciones:\n\n${productList}\n\n¿Cuál quieres agregar? Responde con el nombre exacto.`;
      }

      // Single product found - add first available variant
      const product = products[0];
      const availableVariants = product.variants.filter((v) => v.stock > 0 && v.isActive);

      if (availableVariants.length === 0) {
        return `😔 "${product.name}" no tiene stock disponible.\n\nEscribe "buscar" para ver otros productos.`;
      }

      // If multiple variants, ask for clarification
      if (availableVariants.length > 1) {
        const variantList = availableVariants
          .map(
            (v, i) =>
              `${i + 1}. ${v.name} - $${Number(v.price).toFixed(2)} (${v.stock} disponibles)`,
          )
          .join('\n');

        return `*${product.name}* tiene varias opciones:\n\n${variantList}\n\n¿Cuál variante quieres? Responde con el nombre.`;
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
        product.name,
        variant.name,
        variant.price.toNumber(),
        summary,
      );
    } catch (error) {
      this.logger.error(`Failed to add to cart: ${error.message}`, error.stack);

      // Handle stock validation errors gracefully
      if (error.message.includes('Stock insuficiente')) {
        return `😔 ${error.message}`;
      }

      return '❌ Error al agregar al carrito. Intenta de nuevo.';
    }
  }

  /**
   * AC-08: Handle VIEW_CART intent
   * REQ-05: Shows cart summary in WhatsApp-friendly format
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @returns Formatted cart summary
   */
  async handleShowCart(customerId: string, merchantId: string): Promise<string> {
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
   * AC-12: Handle REMOVE_FROM_CART intent
   * REQ-11: Detects item, removes, responds confirmation
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param productQuery - Product name extracted from message
   * @returns Formatted response message
   */
  async handleRemoveItem(
    customerId: string,
    merchantId: string,
    productQuery: string,
  ): Promise<string> {
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
  async handleUpdateQuantity(
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

  /**
   * Format add confirmation message
   */
  private formatAddConfirmation(
    productName: string,
    variantName: string,
    price: number,
    summary: CartSummary,
  ): string {
    return `✅ *Agregado al carrito*

📦 ${productName} - ${variantName}
💰 $${price.toFixed(2)}

🛒 Total en tu carrito: *$${summary.total.toFixed(2)}* (${summary.itemCount} ${summary.itemCount === 1 ? 'producto' : 'productos'})

Escribe "ver carrito" para revisar o "buscar" para agregar más productos.`;
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
