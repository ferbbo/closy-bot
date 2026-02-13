import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cart, CartItem } from '@prisma/client';
import { CartRepository } from '../persistence/repositories/cart.repository';
import { ProductRepository } from '../persistence/repositories/product.repository';
import { Decimal } from '@prisma/client/runtime/library';

export interface AddToCartInput {
  conversationId: string;
  customerId: string;
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CartSummary {
  cartId: string;
  items: Array<{
    id: string;
    productId: string;
    productName?: string;
    variantId?: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  itemCount: number;
  subtotal: number;
  total: number;
}

/**
 * CartService handles shopping cart business logic
 * Enforces stock validation and price consistency
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly productRepository: ProductRepository,
  ) {}

  /**
   * Get or create cart for a conversation
   */
  async getOrCreateCart(
    conversationId: string,
    customerId: string,
  ): Promise<Cart & { items: CartItem[] }> {
    let cart = await this.cartRepository.findByConversationId(conversationId);

    if (!cart) {
      this.logger.log(`Creating new cart for conversation ${conversationId}`);
      const created = await this.cartRepository.create({
        customer: { connect: { id: customerId } },
        conversationId,
      });
      // Fetch with items
      cart = await this.cartRepository.findById(created.id);
      if (!cart) {
        throw new Error('Failed to create cart');
      }
    }

    return cart;
  }

  /**
   * Add item to cart
   * Validates product availability and stock
   */
  async addItem(input: AddToCartInput): Promise<Cart & { items: CartItem[] }> {
    const { conversationId, customerId, productId, variantId, quantity } = input;

    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    // Get or create cart
    const cart = await this.getOrCreateCart(conversationId, customerId);

    // Validate product and variant
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    if (!product.isActive) {
      throw new BadRequestException(`Product ${product.name} is not available`);
    }

    let unitPrice: Decimal;
    let availableStock: number;

    if (variantId) {
      // Validate variant
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) {
        throw new NotFoundException(`Variant ${variantId} not found for product ${productId}`);
      }

      if (!variant.isActive) {
        throw new BadRequestException(`Variant ${variant.name} is not available`);
      }

      availableStock = variant.stock;
      unitPrice = variant.price;
    } else {
      // Use first available variant if no specific variant selected
      const availableVariant = product.variants.find((v) => v.isActive && v.stock > 0);
      if (!availableVariant) {
        throw new BadRequestException(`Product ${product.name} has no available variants`);
      }

      availableStock = availableVariant.stock;
      unitPrice = availableVariant.price;
    }

    // Validate stock
    if (availableStock < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${availableStock}, requested: ${quantity}`,
      );
    }

    // Add item (repository handles idempotency via upsert)
    await this.cartRepository.addItem({
      cart: { connect: { id: cart.id } },
      product: { connect: { id: productId } },
      ...(variantId && { variant: { connect: { id: variantId } } }),
      quantity,
      unitPrice,
    });

    this.logger.log(`Added ${quantity} of product ${productId} to cart ${cart.id}`);

    // Return updated cart
    const updated = await this.cartRepository.findById(cart.id);
    if (!updated) {
      throw new Error('Failed to fetch updated cart');
    }
    return updated;
  }

  /**
   * Update cart item quantity
   */
  async updateItemQuantity(
    conversationId: string,
    itemId: string,
    quantity: number,
  ): Promise<Cart & { items: CartItem[] }> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    const cart = await this.cartRepository.findByConversationId(conversationId);
    if (!cart) {
      throw new NotFoundException(`Cart not found for conversation ${conversationId}`);
    }

    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in cart`);
    }

    // Validate stock
    const product = await this.productRepository.findById(item.productId);
    if (!product) {
      throw new NotFoundException(`Product ${item.productId} not found`);
    }

    let availableStock: number;
    if (item.productVariantId) {
      const variant = product.variants.find((v) => v.id === item.productVariantId);
      if (!variant) {
        throw new NotFoundException(`Variant not found`);
      }
      availableStock = variant.stock;
    } else {
      const variant = product.variants.find((v) => v.isActive && v.stock > 0);
      if (!variant) {
        throw new BadRequestException(`Product has no available variants`);
      }
      availableStock = variant.stock;
    }

    if (availableStock < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${availableStock}, requested: ${quantity}`,
      );
    }

    await this.cartRepository.updateItemQuantity(itemId, quantity);

    this.logger.log(`Updated item ${itemId} quantity to ${quantity}`);

    const updated = await this.cartRepository.findById(cart.id);
    if (!updated) {
      throw new Error('Failed to fetch updated cart');
    }
    return updated;
  }

  /**
   * Remove item from cart
   */
  async removeItem(conversationId: string, itemId: string): Promise<Cart & { items: CartItem[] }> {
    const cart = await this.cartRepository.findByConversationId(conversationId);
    if (!cart) {
      throw new NotFoundException(`Cart not found for conversation ${conversationId}`);
    }

    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in cart`);
    }

    await this.cartRepository.removeItem(itemId);

    this.logger.log(`Removed item ${itemId} from cart ${cart.id}`);

    const updated = await this.cartRepository.findById(cart.id);
    if (!updated) {
      throw new Error('Failed to fetch updated cart');
    }
    return updated;
  }

  /**
   * Get cart summary
   */
  async getCartSummary(conversationId: string): Promise<CartSummary> {
    const cart = await this.cartRepository.findByConversationId(conversationId);

    if (!cart || cart.items.length === 0) {
      return {
        cartId: cart?.id || '',
        items: [],
        itemCount: 0,
        subtotal: 0,
        total: 0,
      };
    }

    const items = cart.items.map((item) => {
      const unitPrice = item.unitPrice.toNumber();
      const total = unitPrice * item.quantity;

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.productVariantId || undefined,
        quantity: item.quantity,
        unitPrice,
        total,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      cartId: cart.id,
      items,
      itemCount,
      subtotal,
      total: subtotal, // For now, total === subtotal (no discounts/taxes)
    };
  }

  /**
   * Clear cart
   */
  async clearCart(conversationId: string): Promise<void> {
    const cart = await this.cartRepository.findByConversationId(conversationId);
    if (!cart) {
      throw new NotFoundException(`Cart not found for conversation ${conversationId}`);
    }

    await this.cartRepository.clearCart(cart.id);

    this.logger.log(`Cleared cart ${cart.id}`);
  }
}
