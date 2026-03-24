'use client';

import { OrderStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CheckCircle, DollarSign, Truck, PackageCheck, XCircle } from 'lucide-react';

/**
 * OrderActions
 * REQ-12, AC-15, AC-16
 * Acciones inline según el status actual de la orden
 */

interface OrderActionsProps {
  orderId: string;
  status: OrderStatus;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onCancelRequest: (orderId: string) => void;
  isLoading?: boolean;
}

export function OrderActions({
  orderId,
  status,
  onStatusChange,
  onCancelRequest,
  isLoading = false,
}: OrderActionsProps) {
  const disabled = isLoading;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {status === 'pending_payment' && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onStatusChange(orderId, 'confirmed')}
          className="text-xs h-7 px-2"
        >
          <CheckCircle className="h-3 w-3 mr-1" />
          Confirmar
        </Button>
      )}

      {status === 'confirmed' && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onStatusChange(orderId, 'paid')}
          className="text-xs h-7 px-2 text-green-700 border-green-300 hover:bg-green-50"
        >
          <DollarSign className="h-3 w-3 mr-1" />
          Marcar pagado
        </Button>
      )}

      {status === 'paid' && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onStatusChange(orderId, 'shipped')}
          className="text-xs h-7 px-2 text-purple-700 border-purple-300 hover:bg-purple-50"
        >
          <Truck className="h-3 w-3 mr-1" />
          Marcar enviado
        </Button>
      )}

      {status === 'shipped' && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onStatusChange(orderId, 'delivered')}
          className="text-xs h-7 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
        >
          <PackageCheck className="h-3 w-3 mr-1" />
          Marcar entregado
        </Button>
      )}

      {/* Cancelar — available for all non-final states */}
      {status !== 'delivered' && status !== 'cancelled' && (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onCancelRequest(orderId)}
          className="text-xs h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
          title="Cancelar pedido"
        >
          <XCircle className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
