'use client';

/**
 * TanStack Query hooks for Channels UI (PR-FE-03)
 *
 * useChannels()       — REQ-01, AC-01: lista canales del merchant
 * useChannelHealth()  — REQ-03, AC-04: health por canal
 * useRetryWebhook()   — REQ-04, AC-06: mutation retry webhook
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Channel, type ChannelHealth, type RetryWebhookResponse } from '@/lib/api';

// ─── useChannels — AC-01, AC-02 ──────────────────────────────────────────────

export function useChannels() {
  return useQuery<Channel[], ApiError>({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
    staleTime: 30_000, // 30s — reduce requests frecuentes
    retry: (failureCount, error) => {
      // No reintentar en 401/403/404
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

// ─── useChannelHealth — AC-04, AC-05 ─────────────────────────────────────────

export function useChannelHealth(channelId: string, enabled = true) {
  return useQuery<ChannelHealth, ApiError>({
    queryKey: ['channels', channelId, 'health'],
    queryFn: () => api.getChannelHealth(channelId),
    enabled: enabled && !!channelId,
    staleTime: 10_000, // 10s — health puede cambiar rápido
    retry: (failureCount, error) => {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

// ─── useRetryWebhook — AC-06, AC-07 ──────────────────────────────────────────

export function useRetryWebhook(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation<RetryWebhookResponse, ApiError>({
    mutationFn: () => api.retryWebhook(channelId),
    onSuccess: () => {
      // Invalidar health + lista de canales para refetch actualizado
      void queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'health'] });
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}
