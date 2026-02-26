'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Package } from 'lucide-react';
import { ApiError } from '@/lib/api';
import type { ImportStats } from '@/lib/api';
import { useProducts } from '@/hooks/use-catalog';
import { useImportCatalog } from '@/hooks/use-catalog';
import { CatalogUpload } from './components/catalog-upload';
import { ImportStatsCard } from './components/import-stats-card';
import { ProductsTable } from './components/products-table';
import { EmptyCatalogState } from './components/empty-catalog-state';

/** AC-12: Skeleton placeholder while loading */
function ProductsTableSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden animate-pulse">
      <div className="hidden md:block">
        <div className="bg-gray-50 px-4 py-3 flex gap-4">
          {[40, 20, 20, 10, 10].map((w, i) => (
            <div key={i} className={`h-3 bg-gray-200 rounded`} style={{ width: `${w}%` }} />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-4 flex gap-4 border-t border-gray-100">
            <div className="h-4 bg-gray-100 rounded" style={{ width: '40%' }} />
            <div className="h-4 bg-gray-100 rounded" style={{ width: '20%' }} />
            <div className="h-4 bg-gray-100 rounded" style={{ width: '20%' }} />
            <div className="h-4 bg-gray-100 rounded ml-auto" style={{ width: '8%' }} />
            <div className="h-4 bg-gray-100 rounded" style={{ width: '8%' }} />
            <div className="h-5 bg-gray-100 rounded" style={{ width: '6%' }} />
          </div>
        ))}
      </div>
      {/* Mobile skeleton */}
      <div className="md:hidden divide-y divide-gray-100">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
            <div className="h-5 bg-gray-100 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const uploadRef = useRef<HTMLDivElement>(null);
  const [lastImportStats, setLastImportStats] = useState<ImportStats | null>(null);

  const { data, isLoading, isError } = useProducts();
  const importMutation = useImportCatalog();

  const products = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleUpload = (formData: FormData) => {
    importMutation.mutate(formData, {
      onSuccess: (stats) => {
        setLastImportStats(stats);
        if (stats.errors.length > 0) {
          toast.warning(
            `${stats.created + stats.updated} productos importados con ${stats.errors.length} error${stats.errors.length !== 1 ? 'es' : ''}`,
          );
        } else {
          toast.success(
            stats.created > 0
              ? `${stats.created} producto${stats.created !== 1 ? 's' : ''} importado${stats.created !== 1 ? 's' : ''} correctamente`
              : `${stats.updated} producto${stats.updated !== 1 ? 's' : ''} actualizado${stats.updated !== 1 ? 's' : ''}`,
          );
        }
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          if (error.status === 401) {
            toast.error('Sesión expirada. Redirigiendo al login...');
            window.location.href = '/login';
          } else if (error.status === 413) {
            toast.error(`Archivo demasiado grande. Límite: 5MB`);
          } else {
            toast.error(error.message || 'Error al importar catálogo');
          }
        } else {
          toast.error('Error de conexión. Intenta de nuevo.');
        }
      },
    });
  };

  const scrollToUpload = () => {
    uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Package className="h-6 w-6 text-gray-700 flex-shrink-0" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Catálogo</h1>
            {!isLoading && !isError && (
              <p className="text-sm text-gray-500">
                {total > 0 ? `${total} producto${total !== 1 ? 's' : ''}` : 'Sin productos aún'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Import stats feedback (AC-05) */}
      {lastImportStats && (
        <ImportStatsCard
          stats={lastImportStats}
          onDismiss={() => setLastImportStats(null)}
        />
      )}

      {/* Upload zone (AC-01, AC-02) */}
      <div ref={uploadRef}>
        <h2 className="text-sm font-medium text-gray-700 mb-2">Importar catálogo CSV</h2>
        <CatalogUpload isPending={importMutation.isPending} onUpload={handleUpload} />
      </div>

      {/* Products section */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Productos
          {!isLoading && total > 0 && (
            <span className="ml-2 text-xs text-gray-400 font-normal">({total})</span>
          )}
        </h2>

        {/* AC-12: Loading skeleton */}
        {isLoading && <ProductsTableSkeleton />}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar los productos. Recarga la página para intentar de nuevo.
          </div>
        )}

        {/* AC-09: Empty state */}
        {!isLoading && !isError && products.length === 0 && (
          <EmptyCatalogState onImportClick={scrollToUpload} />
        )}

        {/* AC-07, AC-08: Products table */}
        {!isLoading && !isError && products.length > 0 && (
          <ProductsTable products={products} />
        )}
      </div>
    </div>
  );
}
