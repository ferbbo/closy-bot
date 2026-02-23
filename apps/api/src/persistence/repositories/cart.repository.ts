import { Injectable, Logger } from '@nestjs/common';
import { Cart, CartItem, CartStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Type for Cart with items included
 */
export type CartWithItems = Cart & {
  items: (CartItem & {
    variant: {
      id: string;
      name: string;
      price: Prisma.Decimal;
      productId: string;
      product: {
        id: string;
        name: string;
      };
    };
  })[];
};

/**
 * Repository for Cart persistence
 * PR-04: Cart CRUD conversacional
 */
@Injectable()
export class CartRepository {
  private readonly logger = new Logger(CartRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new cart
   */
  async create(data: Prisma.CartCreateInput): Promise<Cart> {
    return this.prisma.cart.create({ data });
  }

  /**
   * Find cart by ID with items
   */
  async findByIdWithItems(id: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * AC-03: Find active cart for customer and merchant (brief naming)
   * REQ-02: Alias for findActiveCart
   */
  async findActiveByCustomerAndMerchant(
    customerId: string,
    merchantId: string,
  ): Promise<Cart | null> {
    return this.findActiveCart(customerId, merchantId);
  }

  /**
   * Find active cart for customer and merchant
   * Filters out expired carts even if status is still active
   */
  async findActiveCart(customerId: string, merchantId: string): Promise<Cart | null> {
    return this.prisma.cart.findFirst({
      where: {
        customerId,
        merchantId,
        status: CartStatus.active,
        expiresAt: {
          gt: new Date(), // TTL strict: only non-expired carts
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Update cart status
   */
  async updateStatus(id: string, status: CartStatus): Promise<Cart> {
    return this.prisma.cart.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Refresh TTL (expiresAt) for active cart
   * AC-13: Update expiresAt on cart operations (create/update)
   */
  async refreshTTL(id: string, expiresAt: Date): Promise<Cart> {
    return this.prisma.cart.update({
      where: { id },
      data: { expiresAt },
    });
  }

  /**
   * Find expired carts
   */
  async findExpiredCarts(): Promise<Cart[]> {
    return this.prisma.cart.findMany({
      where: {
        status: CartStatus.active,
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  /**
   * Delete cart by ID
   */
  async delete(id: string): Promise<Cart> {
    return this.prisma.cart.delete({
      where: { id },
    });
  }
}
