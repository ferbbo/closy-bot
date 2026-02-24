import { Injectable, Logger } from '@nestjs/common';
import { Order, OrderItem, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Order with items included
 */
export type OrderWithItems = Order & {
  items: (OrderItem & {
    variant: {
      id: string;
      name: string;
      productId: string;
      product: {
        id: string;
        name: string;
      };
    };
  })[];
};

/**
 * OrderRepository
 * PR-05: Checkout Order Creation
 * REQ-01: Persist orders + order items with snapshot pricing
 * REQ-03: orderCode generation (sequential per merchant)
 */
@Injectable()
export class OrderRepository {
  private readonly logger = new Logger(OrderRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an order with its items in a single transaction
   * AC-02: FK constraints respected; AC-09: snapshots captured
   */
  async createWithItems(
    orderData: Prisma.OrderCreateInput,
    items: Prisma.OrderItemCreateManyOrderInput[],
  ): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          ...orderData,
          items: {
            createMany: { data: items },
          },
        },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      });
      return order as OrderWithItems;
    });
  }

  /**
   * Find order by ID with items
   */
  async findByIdWithItems(id: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: { product: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }) as Promise<OrderWithItems | null>;
  }

  /**
   * Find order by orderCode + merchantId (unique pair)
   */
  async findByOrderCode(orderCode: string, merchantId: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { orderCode_merchantId: { orderCode, merchantId } },
    });
  }

  /**
   * Count orders for a merchant — used for sequential orderCode generation (REQ-03, AC-03)
   */
  async countByMerchant(merchantId: string): Promise<number> {
    return this.prisma.order.count({ where: { merchantId } });
  }

  /**
   * Update order status
   */
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.prisma.order.update({ where: { id }, data: { status } });
  }

  /**
   * Find orders for a merchant (with pagination)
   */
  async findByMerchant(merchantId: string, take = 20, skip = 0): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }
}
