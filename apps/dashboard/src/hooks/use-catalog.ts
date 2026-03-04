

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ImportStats, type Product } from '@/lib/api';

export const CATALOG_KEYS = {
  products: ['products'] as const,
};

/** AC-06: Fetch all merchant products */
export function useProducts() {
  return useQuery<{ data: Product[]; total: number }>({
    queryKey: CATALOG_KEYS.products,
    queryFn: api.getProducts,
    staleTime: 30_000, // 30s cache
    retry: 2,
  });
}

/** AC-03, AC-04: Import CSV catalog via multipart/form-data */
export function useImportCatalog() {
  const queryClient = useQueryClient();
  return useMutation<ImportStats, Error, FormData>({
    mutationFn: (formData: FormData) => api.importCatalogFile(formData),
    onSuccess: () => {
      // Invalidate products list to trigger refetch
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEYS.products });
    },
  });
}
