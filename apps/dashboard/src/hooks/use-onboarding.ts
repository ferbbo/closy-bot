'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type ApplyPresetRequest,
  type OnboardingProgress,
  type PaymentMethodsConfig,
} from '@/lib/api';

/** AC-11: Polling each 10s while wizard is open */
const PROGRESS_POLL_INTERVAL = 10_000;

export const ONBOARDING_KEYS = {
  progress: ['onboarding', 'progress'] as const,
};

export function useOnboardingProgress() {
  return useQuery<OnboardingProgress>({
    queryKey: ONBOARDING_KEYS.progress,
    queryFn: api.getOnboardingProgress,
    refetchInterval: PROGRESS_POLL_INTERVAL,
    staleTime: 5_000,
    retry: 2,
  });
}

/** AC-04: Apply industry preset */
export function useApplyPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyPresetRequest) => api.applyPreset(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEYS.progress });
    },
  });
}

/** AC-06: Upload catalog CSV */
export function useImportCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.importCatalogFile(formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEYS.progress });
    },
  });
}

/** AC-07: Save payment methods config */
export function useSavePaymentConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: PaymentMethodsConfig) => api.savePaymentConfig(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEYS.progress });
    },
  });
}

/** AC-08, AC-09: Activate merchant */
export function useActivateMerchant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.activateMerchant(),
    onSuccess: () => {
      // Invalidate auth to update merchant.status → triggers redirect
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEYS.progress });
    },
  });
}
