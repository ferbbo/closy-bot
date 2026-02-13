import { Injectable, Logger } from '@nestjs/common';
import { Cart, CartItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for Cart persistence
 * Handles cart and cart items operations
 */
@Injectable()
export class CartRepository {
  private readonly logger = new Logger(CartRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find cart by conversation ID (one cart per conversation)
   * Includes all cart items by default
   */
  async findByConversationId(
    conversationId: string,
  ): Promise<(Cart & { items: CartItem[] }) | null> {
    return this.prisma.cart.findUnique({
      where: { conversationId },
      include: { items: true },
    });
  }

  /**
   * Create a new cart for a customer and conversation
   * @throws PrismaClientKnownRequestError with code 'P2002' if cart already exists for conversation
   */
  async create(data: Prisma.CartCreateInput): Promise<Cart> {
    return this.prisma.cart.create({ data });
  }

  /**
   * Find cart by ID
   */
  async findById(id: string): Promise<(Cart & { items: CartItem[] }) | null> {
    return this.prisma.cart.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  /**
   * Add an item to cart
   * Uses upsert for idempotency: if item exists (same product + variant), update quantity
   */
  async addItem(data: Prisma.CartItemCreateInput): Promise<CartItem> {
    const { cartId, productId, productVariantId, quantity, unitPrice } = data as {
      cartId: string;
      productId: string;
      productVariantId?: string | null;
      quantity: number;
      unitPrice: number | Prisma.Decimal;
    };

    // Upsert: if item exists, increment quantity; otherwise create
    return this.prisma.cartItem.upsert({
      where: {
        cart_items_unique_product_per_cart: {
          cartId,
          productId,
          productVariantId: productVariantId || null,
        },
      },
      update: {
        quantity: { increment: quantity },
        unitPrice, // Update price to current
      },
      create: data,
    });
  }

  /**
   * Update cart item quantity
   */
  async updateItemQuantity(itemId: string, quantity: number): Promise<CartItem> {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  /**
   * Remove an item from cart
   */
  async removeItem(itemId: string): Promise<void> {
    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });
  }

  /**
   * Clear all items from cart
   */
  async clearCart(cartId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { cartId },
    });
  }

  /**
   * Delete a cart and all its items (cascade)
   */
  async delete(cartId: string): Promise<void> {
    await this.prisma.cart.delete({
      where: { id: cartId },
    });
  }
}
