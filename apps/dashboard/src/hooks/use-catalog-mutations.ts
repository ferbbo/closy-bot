'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type Product, type ProductVariant } from '@/lib/api';
import { CATALOG_KEYS } from './use-catalog';

/**
 * AC-10: Hook for updating a product (name, description, isActive)
 * Invalidates products cache on success.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation<
    Product,
    Error,
    { id: string; data: Partial<Pick<Product, 'name' | 'description' | 'isActive'>> }
  >({
    mutationFn: ({ id, data }) => api.updateProduct(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEYS.products });
      toast.success('Producto actualizado');
    },
    onError: (error) => {
      toast.error(error.message ?? 'Error al actualizar el producto');
    },
  });
}

/**
 * AC-10: Hook for updating a product variant (price, stock, isActive)
 * Invalidates products cache on success.
 */
export function useUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation<
    ProductVariant,
    Error,
    { id: string; data: Partial<Pick<ProductVariant, 'price' | 'stock' | 'isActive'>> }
  >({
    mutationFn: ({ id, data }) => api.updateVariant(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEYS.products });
      toast.success('Variante actualizada');
    },
    onError: (error) => {
      toast.error(error.message ?? 'Error al actualizar la variante');
    },
  });
}
