'use client';

import { useState } from 'react';
import { OrderSummary, OrderStatus } from '@/lib/api';
import { useOrderDetail } from '@/hooks/use-orders';
import { TableRow, TableCell } from '@/components/ui/table';
import { OrderStatusBadge } from './order-status-badge';
import { OrderActions } from './order-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate, formatPaymentMethod } from '../utils/order-formatters';

/**
 * OrderRow
 * REQ-10, AC-13
 * Fila expandible con detalle de orden (items, cliente, dirección, método de pago)
 */

interface OrderRowProps {
  order: OrderSummary;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onCancelRequest: (orderId: string, orderCode: string) => void;
  isUpdating?: boolean;
}

export function OrderRow({
  order,
  onStatusChange,
  onCancelRequest,
  isUpdating = false,
}: OrderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading: detailLoading } = useOrderDetail(
    expanded ? order.id : null,
  );

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Expand toggle */}
        <TableCell className="w-8 p-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </TableCell>

        {/* Order code */}
        <TableCell className="font-mono text-sm font-medium text-gray-900">
          {order.orderCode}
        </TableCell>

        {/* Customer */}
        <TableCell className="text-sm text-gray-700">
          <div>{order.customerName}</div>
          <div className="text-xs text-gray-400">{order.customerPhone}</div>
        </TableCell>

        {/* Total */}
        <TableCell className="text-sm font-medium text-gray-900 text-right">
          {formatCurrency(order.totalAmount)}
        </TableCell>

        {/* Status */}
        <TableCell onClick={(e) => e.stopPropagation()}>
          <OrderStatusBadge status={order.status} />
        </TableCell>

        {/* Date */}
        <TableCell className="text-xs text-gray-500 hidden md:table-cell">
          {formatDate(order.createdAt)}
        </TableCell>

        {/* Actions */}
        <TableCell onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
          <OrderActions
            orderId={order.id}
            status={order.status}
            onStatusChange={onStatusChange}
            onCancelRequest={(id) => onCancelRequest(id, order.orderCode)}
            isLoading={isUpdating}
          />
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      {expanded && (
        <TableRow className="bg-blue-50/30 hover:bg-blue-50/30">
          <TableCell colSpan={7} className="px-6 py-4">
            {detailLoading || !detail ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {/* Items */}
                <div>
                  <p className="font-semibold text-gray-700 mb-2">
                    Productos ({detail.items.length})
                  </p>
                  <ul className="space-y-1">
                    {detail.items.map((item) => (
                      <li key={item.id} className="flex justify-between text-xs text-gray-600">
                        <span>
                          {item.snapshotName} × {item.quantity}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(
                            (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-xs font-semibold text-gray-700">
                    <span>Total</span>
                    <span>{formatCurrency(detail.totalAmount)}</span>
                  </div>
                </div>

                {/* Client + address */}
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">Cliente</p>
                    <p className="text-xs text-gray-600">{detail.customerName}</p>
                    <p className="text-xs text-gray-500">{detail.customerPhone}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">Dirección de envío</p>
                    <p className="text-xs text-gray-600">{detail.shippingAddress}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">Método de pago</p>
                    <p className="text-xs text-gray-600">
                      {formatPaymentMethod(detail.paymentMethod)}
                    </p>
                  </div>
                  {detail.notes && (
                    <div>
                      <p className="font-semibold text-gray-700 mb-1">Notas</p>
                      <p className="text-xs text-gray-500 italic">{detail.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
