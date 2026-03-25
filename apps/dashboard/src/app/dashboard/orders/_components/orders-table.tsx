'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import { OrderSummary, OrderStatus } from '@/lib/api';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { CancelOrderModal } from './cancel-order-modal';
import { OrderRow } from './order-row';
import { EmptyOrdersState } from './empty-orders-state';
import { useUpdateOrderStatus } from '@/hooks/use-orders';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

/**
 * OrdersTable
 * REQ-08, AC-10, AC-11
 * TanStack Table con sorting, columnas y filas expandibles
 */

interface OrdersTableProps {
  orders: OrderSummary[];
  isLoading?: boolean;
}

type CancelState = { orderId: string; orderCode: string } | null;

export function OrdersTable({ orders, isLoading = false }: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [cancelState, setCancelState] = useState<CancelState>(null);

  const { mutate: updateStatus, isPending: isUpdating, variables: updatingVars } =
    useUpdateOrderStatus();

  const handleStatusChange = (orderId: string, status: OrderStatus) => {
    updateStatus({ orderId, status });
  };

  const handleCancelRequest = (orderId: string, orderCode: string) => {
    setCancelState({ orderId, orderCode });
  };

  const handleCancelConfirm = () => {
    if (cancelState) {
      updateStatus(
        { orderId: cancelState.orderId, status: 'cancelled' },
        { onSettled: () => setCancelState(null) },
      );
    }
  };

  // Column definitions (for sorting metadata — rendering is in OrderRow)
  const columns: ColumnDef<OrderSummary>[] = [
    { id: 'expand', enableSorting: false },
    { accessorKey: 'orderCode', header: 'Pedido', enableSorting: true },
    { accessorKey: 'customerName', header: 'Cliente', enableSorting: true },
    { accessorKey: 'totalAmount', header: 'Total', enableSorting: true },
    { accessorKey: 'status', header: 'Estado', enableSorting: false },
    { accessorKey: 'createdAt', header: 'Fecha', enableSorting: true },
    { id: 'actions', header: 'Acciones', enableSorting: false },
  ];

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return <EmptyOrdersState />;
  }

  return (
    <>
      {/* Responsive wrapper — horizontal scroll on mobile */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-gray-50 hover:bg-gray-50">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        className={canSort ? 'cursor-pointer select-none' : ''}
                      >
                        <div className="flex items-center gap-1">
                          {typeof header.column.columnDef.header === 'string'
                            ? header.column.columnDef.header
                            : null}
                          {canSort && (
                            <span className="text-gray-400">
                              {sorted === 'asc' ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : sorted === 'desc' ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronsUpDown className="h-3 w-3" />
                              )}
                            </span>
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <OrderRow
                  key={row.original.id}
                  order={row.original}
                  onStatusChange={handleStatusChange}
                  onCancelRequest={handleCancelRequest}
                  isUpdating={
                    isUpdating && updatingVars?.orderId === row.original.id
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      <CancelOrderModal
        open={Boolean(cancelState)}
        orderCode={cancelState?.orderCode}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelState(null)}
        isLoading={isUpdating && updatingVars?.orderId === cancelState?.orderId}
      />
    </>
  );
}
