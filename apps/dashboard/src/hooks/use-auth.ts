'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type MerchantInfo } from '@/lib/api';

export function useAuth() {
  const {
    data: merchant,
    isLoading,
    error,
  } = useQuery<MerchantInfo>({
    queryKey: ['auth', 'me'],
    queryFn: api.getMe,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    merchant,
    isLoading,
    isAuthenticated: !!merchant && !error,
    error,
  };
}
