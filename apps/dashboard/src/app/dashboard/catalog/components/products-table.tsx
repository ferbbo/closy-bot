'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/api';

interface ProductsTableProps {
  products: Product[];
}

/** AC-07, AC-08: Products table with columns + active/inactive badge */
export function ProductsTable({ products }: ProductsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Producto
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categoría
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Precio
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((product) => {
              // Use first variant for price/stock display; fallback if no variants
              const primaryVariant = product.variants[0];
              const price = primaryVariant?.price;
              const stock = primaryVariant?.stock;
              const sku = primaryVariant?.sku;
              const variantCount = product.variants.length;

              return (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">
                        {product.name}
                      </p>
                      {variantCount > 1 && (
                        <p className="text-xs text-gray-400">{variantCount} variantes</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {product.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                    {sku ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {price != null
                      ? new Intl.NumberFormat('es-CO', {
                          style: 'currency',
                          currency: 'COP',
                          maximumFractionDigits: 0,
                        }).format(price)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    {stock != null ? `${stock} u.` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge isActive={product.isActive} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-100">
        {products.map((product) => {
          const primaryVariant = product.variants[0];
          const price = primaryVariant?.price;
          const stock = primaryVariant?.stock;

          return (
            <div key={product.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {product.category?.name ?? '—'} · {stock != null ? `${stock} u.` : 'sin stock'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {price != null && (
                  <span className="text-sm font-semibold text-gray-900">
                    {new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                      maximumFractionDigits: 0,
                    }).format(price)}
                  </span>
                )}
                <StatusBadge isActive={product.isActive} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-medium',
        isActive
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-gray-200 bg-gray-50 text-gray-500',
      )}
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}
