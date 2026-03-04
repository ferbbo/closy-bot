

import { useQuery } from '@tanstack/react-query';
import { api, type AuthMeResponse } from '@/lib/api';

export function useAuth() {
  const {
    data,
    isLoading,
    error,
  } = useQuery<AuthMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: api.getMe,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    merchant: data?.merchant,
    isLoading,
    isAuthenticated: data?.authenticated ?? false,
    error,
  };
}
