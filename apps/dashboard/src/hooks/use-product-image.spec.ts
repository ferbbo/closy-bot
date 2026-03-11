import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { api } from '@/lib/api';
import { useProductImage } from './use-product-image';
import { CATALOG_KEYS } from './use-catalog';

jest.mock('@/lib/api', () => ({
  api: {
    uploadProductImage: jest.fn(),
    deleteProductImage: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

type CacheShape = { data: { id: string; imageUrl?: string; imageKey?: string }[]; total: number };

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('AC-03: useProductImage — upload', () => {
  it('actualiza imageUrl e imageKey en cache sin refetch al hacer upload exitoso', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData(CATALOG_KEYS.products, {
      data: [{ id: 'p1', name: 'Camiseta', imageUrl: undefined, imageKey: undefined }],
      total: 1,
    });

    (api.uploadProductImage as jest.Mock).mockResolvedValue({
      imageKey: 'key-abc',
      imageUrl: 'https://cdn.example.com/img.jpg',
    });

    const { result } = renderHook(() => useProductImage(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.uploadImage.mutateAsync({
        productId: 'p1',
        file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
      });
    });

    await waitFor(() => {
      const cache = qc.getQueryData<CacheShape>(CATALOG_KEYS.products);
      expect(cache?.data[0].imageUrl).toBe('https://cdn.example.com/img.jpg');
      expect(cache?.data[0].imageKey).toBe('key-abc');
    });
  });

  it('no modifica otros productos en el cache', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData(CATALOG_KEYS.products, {
      data: [
        { id: 'p1', name: 'Camiseta', imageUrl: undefined, imageKey: undefined },
        { id: 'p2', name: 'Pantalón', imageUrl: 'https://cdn.example.com/other.jpg', imageKey: 'key-other' },
      ],
      total: 2,
    });

    (api.uploadProductImage as jest.Mock).mockResolvedValue({
      imageKey: 'key-new',
      imageUrl: 'https://cdn.example.com/new.jpg',
    });

    const { result } = renderHook(() => useProductImage(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.uploadImage.mutateAsync({
        productId: 'p1',
        file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
      });
    });

    await waitFor(() => {
      const cache = qc.getQueryData<CacheShape>(CATALOG_KEYS.products);
      expect(cache?.data[1].imageUrl).toBe('https://cdn.example.com/other.jpg');
      expect(cache?.data[1].imageKey).toBe('key-other');
    });
  });
});

describe('AC-04: useProductImage — delete', () => {
  it('limpia imageUrl e imageKey en cache sin refetch al eliminar imagen', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData(CATALOG_KEYS.products, {
      data: [{ id: 'p1', name: 'Camiseta', imageUrl: 'https://cdn.example.com/img.jpg', imageKey: 'key-abc' }],
      total: 1,
    });

    (api.deleteProductImage as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useProductImage(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.deleteImage.mutateAsync({ productId: 'p1' });
    });

    await waitFor(() => {
      const cache = qc.getQueryData<CacheShape>(CATALOG_KEYS.products);
      expect(cache?.data[0].imageUrl).toBeUndefined();
      expect(cache?.data[0].imageKey).toBeUndefined();
    });
  });
});
