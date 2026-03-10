'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type Product, type ProductVariant } from '@/lib/api';
import { CATALOG_KEYS } from './use-catalog';

type ProductsCache = { data: Product[]; total: number };

/**
 * AC-10: Hook for updating a product (name, description, isActive).
 * Updates the cache in-place with setQueryData to avoid triggering a refetch
 * and re-rendering the parent page.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation<
    Product,
    Error,
    { id: string; data: Partial<Pick<Product, 'name' | 'description' | 'isActive'>> }
  >({
    mutationFn: ({ id, data }) => api.updateProduct(id, data),
    onSuccess: (updatedProduct) => {
      queryClient.setQueryData<ProductsCache>(CATALOG_KEYS.products, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((p) => (p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p)),
        };
      });
      toast.success('Producto actualizado');
    },
    onError: (error) => {
      toast.error(error.message ?? 'Error al actualizar el producto');
    },
  });
}

/**
 * AC-10: Hook for updating a product variant (price, stock, isActive).
 * Updates the variant inside its parent product in the cache with setQueryData
 * to avoid triggering a refetch and re-rendering the parent page.
 */
export function useUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation<
    ProductVariant,
    Error,
    { id: string; data: Partial<Pick<ProductVariant, 'price' | 'stock' | 'isActive'>> }
  >({
    mutationFn: ({ id, data }) => api.updateVariant(id, data),
    onSuccess: (updatedVariant) => {
      queryClient.setQueryData<ProductsCache>(CATALOG_KEYS.products, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((product) => {
            if (!product.variants.some((v) => v.id === updatedVariant.id)) return product;
            return {
              ...product,
              variants: product.variants.map((v) =>
                v.id === updatedVariant.id ? { ...v, ...updatedVariant } : v,
              ),
            };
          }),
        };
      });
      toast.success('Variante actualizada');
    },
    onError: (error) => {
      toast.error(error.message ?? 'Error al actualizar la variante');
    },
  });
}
