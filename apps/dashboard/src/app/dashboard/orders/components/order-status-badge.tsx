import { OrderStatus } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

/**
 * OrderStatusBadge
 * REQ-09, AC-12
 * Status badges con colores por estado
 */

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline' | 'pending'; className: string }
> = {
  pending_payment: {
    label: 'Pendiente pago',
    variant: 'pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  confirmed: {
    label: 'Confirmado',
    variant: 'default',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  paid: {
    label: 'Pagado',
    variant: 'success',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  shipped: {
    label: 'Enviado',
    variant: 'default',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  delivered: {
    label: 'Entregado',
    variant: 'success',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  cancelled: {
    label: 'Cancelado',
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-500 border-gray-200',
  },
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;
  return (
    <Badge
      className={`text-xs font-medium border ${config.className}`}
      variant="outline"
    >
      {config.label}
    </Badge>
  );
}
