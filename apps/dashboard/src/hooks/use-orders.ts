

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, OrderFilters, OrderStatus } from '@/lib/api';

/**
 * useOrders
 * REQ-07, REQ-15, AC-09, AC-19
 * Fetches orders list with filters + auto-refresh every 30s (polling)
 */
export const useOrders = (filters: OrderFilters = {}) => {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => api.listOrders(filters),
    staleTime: 30 * 1000, // 30s
    refetchInterval: 30 * 1000, // AC-19: polling cada 30s
  });
};

/**
 * usePendingOrdersCount
 * REQ-14, AC-18
 * Fetches count of pending orders for sidebar badge
 */
export const usePendingOrdersCount = () => {
  return useQuery({
    queryKey: ['orders', 'pending-count'],
    queryFn: () => api.getPendingOrdersCount(),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
};

/**
 * useOrderDetail
 * REQ-10, AC-13
 * Fetches order detail with items (lazy — only when orderId is provided)
 */
export const useOrderDetail = (orderId: string | null) => {
  return useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => api.getOrder(orderId!),
    enabled: Boolean(orderId),
    staleTime: 60 * 1000,
  });
};

/**
 * useUpdateOrderStatus
 * REQ-12, AC-15, AC-16
 * Mutación para cambiar status con optimistic update + rollback
 */
export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      api.updateOrderStatus(orderId, status),

    onMutate: async ({ orderId, status }) => {
      // Cancel in-flight queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['orders'] });

      // Snapshot for rollback
      const previousOrders = queryClient.getQueriesData({ queryKey: ['orders'] });

      // Optimistic update: update status in all cached order lists
      queryClient.setQueriesData(
        { queryKey: ['orders'] },
        (old: unknown) => {
          if (typeof old !== 'object' || old === null) return old;
          const data = old as { orders?: Array<{ id: string; status: OrderStatus }> };
          if (!data.orders) return old;
          return {
            ...data,
            orders: data.orders.map((o) =>
              o.id === orderId ? { ...o, status } : o,
            ),
          };
        },
      );

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousOrders) {
        for (const [queryKey, data] of context.previousOrders) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },

    onSettled: () => {
      // Always refetch to sync with server
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};
