'use client';

import { useState } from 'react';
import { useOrders } from '@/hooks/use-orders';
import { OrderFilters } from '@/lib/api';
import { OrdersTable } from './components/orders-table';
import { OrderFiltersBar } from './components/order-filters';
import { ShoppingBag, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * OrdersPage — "Torre de Control"
 * REQ-07, AC-09, AC-10, AC-14, AC-19, AC-20
 * Página principal de gestión de pedidos del merchant
 */

export default function OrdersPage() {
  const [filters, setFilters] = useState<OrderFilters>({});

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useOrders(filters);

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <ShoppingBag className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Torre de Control
            </h1>
            <p className="text-sm text-gray-500">
              {isLoading
                ? 'Cargando pedidos...'
                : `${total} pedido${total !== 1 ? 's' : ''} en total`}
            </p>
          </div>
        </div>

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <OrderFiltersBar filters={filters} onChange={setFilters} />
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-700">
          <strong>Error al cargar pedidos:</strong>{' '}
          {(error as Error).message ?? 'Error desconocido. Intenta de nuevo.'}
          <button
            onClick={() => refetch()}
            className="ml-2 underline font-medium hover:text-red-800"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Table */}
      <OrdersTable orders={orders} isLoading={isLoading} />

      {/* Pagination */}
      {!isLoading && total > (filters.limit ?? 50) && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Mostrando {orders.length} de {total} pedidos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.offset ?? 0) === 0}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  offset: Math.max(0, (f.offset ?? 0) - (f.limit ?? 50)),
                }))
              }
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={orders.length < (filters.limit ?? 50)}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  offset: (f.offset ?? 0) + (f.limit ?? 50),
                }))
              }
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      <p className="mt-4 text-xs text-gray-400 text-right">
        Actualización automática cada 30 segundos
      </p>
    </div>
  );
}
