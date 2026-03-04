

/**
 * PR-FE-05: usePlaybookConfig hook
 * TanStack Query integration for GET /merchants/me + PATCH /merchants/me/playbook
 * AC-07: load config on mount
 * AC-08, AC-09: save changes
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { PlaybookConfig, MerchantProfile } from '@/types/playbook';

export const MERCHANT_KEYS = {
  me: ['merchant', 'me'] as const,
};

// ── AC-07: Load merchant profile + playbookConfig ─────────────────────────

export function useMerchantProfile() {
  return useQuery<MerchantProfile>({
    queryKey: MERCHANT_KEYS.me,
    queryFn: () =>
      // Cast backend response to our typed MerchantProfile
      api.getMerchantProfile() as unknown as Promise<MerchantProfile>,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// ── AC-08, AC-09: Save playbook section ───────────────────────────────────

interface PatchPlaybookPayload {
  messages?: Partial<PlaybookConfig['messages']>;
  rules?: Partial<PlaybookConfig['rules']>;
  llmPrompt?: Partial<PlaybookConfig['llmPrompt']>;
}

export function usePatchPlaybookConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: PatchPlaybookPayload) =>
      api.patchPlaybookConfig(updates as Record<string, unknown>),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MERCHANT_KEYS.me });
      toast.success('Cambios guardados', {
        description: 'Tu configuración del bot se actualizó correctamente.',
      });
    },
    onError: (error: Error) => {
      toast.error('Error al guardar', {
        description: error.message,
      });
    },
  });
}

// ── Update merchant name (PATCH /merchants/me) ────────────────────────────

export function useUpdateMerchantName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string }) => api.updateMerchantName(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MERCHANT_KEYS.me });
      toast.success('Perfil actualizado', {
        description: 'El nombre de tu negocio fue guardado.',
      });
    },
    onError: (error: Error) => {
      toast.error('Error al guardar perfil', {
        description: error.message,
      });
    },
  });
}
