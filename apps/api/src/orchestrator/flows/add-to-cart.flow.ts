import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';

/**
 * AddToCartFlow
 * AC-07: Handles ADD_TO_CART intent
 * REQ-04: Detects product/variant, adds to cart, responds confirmation
 * PR-04: Cart CRUD conversational
 */
@Injectable()
export class AddToCartFlow {
  private readonly logger = new Logger(AddToCartFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * AC-07: Handle ADD_TO_CART intent
   * REQ-04: Detects product/variant, adds to cart, responds confirmation
   *
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param productQuery - Product name/description extracted from message
   * @param fullText - Full message text for quantity extraction
   * @returns Formatted response message
   */
  async execute(
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
}
