import { Injectable, Logger } from '@nestjs/common';
import { CartItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for CartItem persistence
 * PR-04: Cart CRUD conversacional
 */
@Injectable()
export class CartItemRepository {
  private readonly logger = new Logger(CartItemRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new cart item
   * @throws PrismaClientKnownRequestError with code 'P2002' if (cartId, variantId) already exists
   */
  async create(data: Prisma.CartItemCreateInput): Promise<CartItem> {
    return this.prisma.cartItem.create({ data });
  }

  /**
   * Find cart item by ID
   */
  async findById(id: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findUnique({
      where: { id },
    });
  }

  /**
   * Find cart item by cart and variant
   */
  async findByCartAndVariant(cartId: string, variantId: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findUnique({
      where: {
        // Delivery S1.1: unique is now (cartId, variantId, notes); legacy items have notes=''
        cartId_variantId_notes: {
          cartId,
          variantId,
          notes: '',
        },
      },
    });
  }

  /**
   * Find all items for a cart
   */
  async findByCartId(cartId: string): Promise<CartItem[]> {
    return this.prisma.cartItem.findMany({
      where: { cartId },
    });
  }

  /**
   * Update cart item quantity
   */
  async updateQuantity(id: string, quantity: number): Promise<CartItem> {
    return this.prisma.cartItem.update({
      where: { id },
      data: { quantity },
    });
  }

  /**
   * Delete cart item by ID
   */
  async delete(id: string): Promise<CartItem> {
    return this.prisma.cartItem.delete({
      where: { id },
    });
  }

  /**
   * Delete all items for a cart
   */
  async deleteByCartId(cartId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.cartItem.deleteMany({
      where: { cartId },
    });
  }

  /**
   * Count items in cart
   */
  async countByCartId(cartId: string): Promise<number> {
    return this.prisma.cartItem.count({
      where: { cartId },
    });
  }
}
