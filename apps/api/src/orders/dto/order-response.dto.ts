import { OrderStatus } from '@prisma/client';

/**
 * OrderItemResponseDto
 * Detalle de ítem de orden
 */
export class OrderItemResponseDto {
  id!: string;
  variantId!: string;
  quantity!: number;
  unitPrice!: string;
  snapshotName!: string;
}

/**
 * OrderSummaryDto
 * Versión reducida para lista de órdenes (GET /orders)
 * REQ-04: Response tipado
 */
export class OrderSummaryDto {
  id!: string;
  orderCode!: string;
  customerName!: string;
  customerPhone!: string;
  status!: OrderStatus;
  totalAmount!: string;
  shippingAddress!: string;
  paymentMethod!: string;
  createdAt!: string;
  updatedAt!: string;
  itemCount!: number;
}

/**
 * OrderListResponseDto
 * Respuesta paginada de lista de órdenes
 */
export class OrderListResponseDto {
  orders!: OrderSummaryDto[];
  total!: number;
  limit!: number;
  offset!: number;
}

/**
 * OrderDetailResponseDto
 * Respuesta completa con items (GET /orders/:id)
 * REQ-04: Response tipado para detalle
 */
export class OrderDetailResponseDto {
  id!: string;
  orderCode!: string;
  merchantId!: string;
  customerId!: string;
  customerName!: string;
  customerPhone!: string;
  status!: OrderStatus;
  totalAmount!: string;
  shippingAddress!: string;
  shippingCost!: string;
  paymentMethod!: string;
  notes?: string;
  createdAt!: string;
  updatedAt!: string;
  items!: OrderItemResponseDto[];
}

/**
 * UpdateOrderStatusResponseDto
 * Respuesta mínima tras PATCH /orders/:id/status
 */
export class UpdateOrderStatusResponseDto {
  id!: string;
  orderCode!: string;
  status!: OrderStatus;
  updatedAt!: string;
}
