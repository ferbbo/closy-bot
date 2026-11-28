import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import {
  OrderListResponseDto,
  OrderDetailResponseDto,
  OrderSummaryDto,
  UpdateOrderStatusResponseDto,
} from './dto/order-response.dto';

/**
 * FSM: Transiciones de status permitidas
 * REQ-03, AC-04, AC-05
 *
 * pending_payment → confirmed ✅
 * pending_payment → cancelled ✅
 * confirmed → paid ✅
 * confirmed → cancelled ✅
 * paid → shipped ✅
 * paid → cancelled ✅
 * shipped → delivered ✅
 * delivered → * ❌ (final state)
 * cancelled → * ❌ (final state)
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: [OrderStatus.confirmed, OrderStatus.cancelled],
  confirmed: [OrderStatus.paid, OrderStatus.cancelled],
  paid: [OrderStatus.shipped, OrderStatus.cancelled],
  shipped: [OrderStatus.delivered],
  delivered: [],
  cancelled: [],
  // Delivery vertical statuses (S1.1): same rules as DELIVERY_TRANSITIONS (RN-14)
  preparing: [OrderStatus.on_the_way, OrderStatus.cancelled],
  on_the_way: [OrderStatus.delivered],
};

/**
 * OrdersService
 * REQ-01..03: Lógica de negocio para gestión de órdenes desde dashboard
 * REQ-06: Multi-tenancy — todas las queries filtradas por merchantId
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly orderRepository: OrderRepository) {}

  /**
   * GET /orders — Lista paginada con filtros
   * AC-01, AC-02
   */
  async findAll(merchantId: string, filters: OrderListQueryDto): Promise<OrderListResponseDto> {
    const take = filters.limit ?? 50;
    const skip = filters.offset ?? 0;

    const [orders, total] = await Promise.all([
      this.orderRepository.findAllByMerchantFiltered(merchantId, filters, take, skip),
      this.orderRepository.countByMerchantFiltered(merchantId, filters),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        status: o.status,
        totalAmount: o.totalAmount.toString(),
        shippingAddress: o.shippingAddress,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        itemCount: (o as unknown as { _count?: { items: number } })._count?.items ?? 0,
      })) as OrderSummaryDto[],
      total,
      limit: take,
      offset: skip,
    };
  }

  /**
   * GET /orders/:id — Detalle de orden con items
   * REQ-02, AC-03, AC-08
   */
  async findOne(id: string, merchantId: string): Promise<OrderDetailResponseDto> {
    const order = await this.orderRepository.findByIdWithItems(id);

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (order.merchantId !== merchantId) {
      // AC-08: Multi-tenancy — no revelar que la orden existe
      throw new ForbiddenException('Access denied to this order');
    }

    return {
      id: order.id,
      orderCode: order.orderCode,
      merchantId: order.merchantId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      totalAmount: order.totalAmount.toString(),
      shippingAddress: order.shippingAddress,
      shippingCost: order.shippingCost.toString(),
      paymentMethod: order.paymentMethod,
      notes: order.notes ?? undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        snapshotName: `${item.variant.product.name} - ${item.variant.name}`.trim(),
      })),
    };
  }

  /**
   * PATCH /orders/:id/status — Cambiar status con validación FSM
   * REQ-03, AC-04, AC-05, AC-08
   */
  async updateStatus(
    id: string,
    merchantId: string,
    newStatus: OrderStatus,
  ): Promise<UpdateOrderStatusResponseDto> {
    const order = await this.orderRepository.findByIdWithItems(id);

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (order.merchantId !== merchantId) {
      throw new ForbiddenException('Access denied to this order');
    }

    // FSM validation — AC-05
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transición no permitida: ${order.status} → ${newStatus}. ` +
          `Transiciones válidas: ${allowed.length > 0 ? allowed.join(', ') : 'ninguna (estado final)'}`,
      );
    }

    this.logger.log(
      `Order ${order.orderCode}: ${order.status} → ${newStatus} (merchant: ${merchantId})`,
    );

    const updated = await this.orderRepository.updateStatus(id, newStatus);

    return {
      id: updated.id,
      orderCode: updated.orderCode,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Contar órdenes pendientes para sidebar badge
   * REQ-14, AC-18
   */
  async countPending(merchantId: string): Promise<number> {
    return this.orderRepository.countByMerchantFiltered(merchantId, {
      status: [OrderStatus.pending_payment, OrderStatus.confirmed],
    });
  }
}

// Export FSM for tests
export { ALLOWED_TRANSITIONS };
