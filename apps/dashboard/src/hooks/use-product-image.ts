'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type Product, type UploadImageResponse } from '@/lib/api';
import { CATALOG_KEYS } from './use-catalog';

type ProductsCache = { data: Product[]; total: number };

/**
 * AC-03, AC-04: Mutations for uploading and deleting a product image.
 * Updates the cache in-place with setQueryData to avoid triggering a full refetch.
 */
export function useProductImage() {
  const queryClient = useQueryClient();

  const uploadImage = useMutation<
    UploadImageResponse,
    Error,
    { productId: string; file: File }
  >({
    mutationFn: ({ productId, file }) => api.uploadProductImage(productId, file),
    onSuccess: (data, { productId }) => {
      // AC-03: update imageUrl + imageKey in-place without refetch
      queryClient.setQueryData<ProductsCache>(CATALOG_KEYS.products, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === productId
              ? { ...p, imageKey: data.imageKey, imageUrl: data.imageUrl }
              : p,
          ),
        };
      });
      toast.success('Imagen subida');
    },
    onError: (error) => {
      toast.error((error as Error).message ?? 'Error al subir imagen. Intenta de nuevo');
    },
  });

  const deleteImage = useMutation<void, Error, { productId: string }>({
    mutationFn: ({ productId }) => api.deleteProductImage(productId),
    onSuccess: (_, { productId }) => {
      // AC-04: clear imageUrl + imageKey in-place without refetch
      queryClient.setQueryData<ProductsCache>(CATALOG_KEYS.products, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === productId
              ? { ...p, imageKey: undefined, imageUrl: undefined }
              : p,
          ),
        };
      });
      toast.success('Imagen eliminada');
    },
    onError: (error) => {
      toast.error((error as Error).message ?? 'Error al eliminar imagen. Intenta de nuevo');
    },
  });

  return { uploadImage, deleteImage };
}
