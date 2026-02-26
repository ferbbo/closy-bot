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

  // ---------------------------------------------------------------------------
  // PR-05.1: Methods for MerchantCommandService
  // ---------------------------------------------------------------------------

  /**
   * Find order by orderCode + merchantId including items snapshot
   * Used by MerchantCommandService.getOrderDetails() — AC-10
   */
  async findByOrderCodeWithItems(
    orderCode: string,
    merchantId: string,
  ): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({
      where: { orderCode_merchantId: { orderCode, merchantId } },
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
   * Find pending orders (pending_payment or confirmed) for a merchant
   * Used by MerchantCommandService.listPendingOrders() — AC-11
   */
  async findPendingByMerchant(merchantId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        merchantId,
        status: { in: ['pending_payment', 'confirmed'] as OrderStatus[] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // PR-FE-06: Dashboard Orders API — filtered queries
  // ---------------------------------------------------------------------------

  /**
   * Find orders for a merchant with optional filters (status, date range, orderCode)
   * REQ-01, AC-01, AC-02
   */
  async findAllByMerchantFiltered(
    merchantId: string,
    filters: {
      status?: OrderStatus[];
      dateFrom?: string;
      dateTo?: string;
      orderCode?: string;
    },
    take = 50,
    skip = 0,
  ): Promise<(Order & { _count: { items: number } })[]> {
    return this.prisma.order.findMany({
      where: {
        merchantId,
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
              },
            }
          : {}),
        ...(filters.orderCode
          ? { orderCode: { contains: filters.orderCode, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        _count: { select: { items: true } },
      },
    }) as Promise<(Order & { _count: { items: number } })[]>;
  }

  /**
   * Count orders for a merchant with filters (for pagination total)
   * REQ-01, AC-02
   */
  async countByMerchantFiltered(
    merchantId: string,
    filters: {
      status?: OrderStatus[];
      dateFrom?: string;
      dateTo?: string;
      orderCode?: string;
    },
  ): Promise<number> {
    return this.prisma.order.count({
      where: {
        merchantId,
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
              },
            }
          : {}),
        ...(filters.orderCode
          ? { orderCode: { contains: filters.orderCode, mode: 'insensitive' } }
          : {}),
      },
    });
  }

  /**
   * Get daily summary for merchant: count of orders created today and sum of totalAmount
   * Used by MerchantCommandService.getDailySummary() — AC-12
   * Timezone: UTC (merchant timezone is a future concern)
   */
  async getDailySummary(merchantId: string): Promise<{ count: number; total: number }> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const result = await this.prisma.order.aggregate({
      where: {
        merchantId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    return {
      count: result._count.id,
      total: Number(result._sum.totalAmount ?? 0),
    };
  }
}
