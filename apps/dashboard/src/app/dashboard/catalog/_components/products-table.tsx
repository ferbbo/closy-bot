'use client';

import React, { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EditableCell } from '@/components/ui/editable-cell';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/api';
import { useUpdateProduct, useUpdateVariant } from '@/hooks/use-catalog-mutations';
import { ImageModal } from './image-modal';

interface ProductsTableProps {
  products: Product[];
}

const formatPrice = (value: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value));

/** AC-07, AC-08, AC-09: Products table with inline-editable Name, Precio, Stock columns */
export function ProductsTable({ products }: ProductsTableProps) {
  const updateProduct = useUpdateProduct();
  const updateVariant = useUpdateVariant();
  // AC-08: track which product's ImageModal is open
  const [openImageModalId, setOpenImageModalId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* AC-08: Image column — desktop only */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                Imagen
              </th>
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
              const hasVariant = primaryVariant != null;

              return (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  {/* AC-08: Image thumbnail / placeholder — click opens ImageModal */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setOpenImageModalId(product.id)}
                      className="focus:outline-none focus:ring-2 focus:ring-primary rounded"
                      aria-label={product.imageUrl ? 'Ver imagen del producto' : 'Subir imagen del producto'}
                    >
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded border border-dashed border-gray-300 flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                    </button>
                    {openImageModalId === product.id && (
                      <ImageModal
                        product={product}
                        open={true}
                        onClose={() => setOpenImageModalId(null)}
                      />
                    )}
                  </td>
                  {/* AC-07: Name — editable → PATCH /api/products/:id */}
                  <td className="px-4 py-3">
                    <div>
                      <EditableCell
                        value={product.name}
                        type="text"
                        maxLength={100}
                        formatDisplay={(v) => String(v)}
                        className="text-sm font-medium text-gray-900"
                        onSave={async (newName) => {
                          await updateProduct.mutateAsync({
                            id: product.id,
                            data: { name: String(newName) },
                          });
                        }}
                      />
                      {variantCount > 1 && (
                        <p className="text-xs text-gray-400 px-2">{variantCount} variantes</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {product.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                    {sku ?? '—'}
                  </td>
                  {/* AC-08: Precio — editable → PATCH /api/product-variants/:id */}
                  <td className="px-4 py-3 text-right">
                    {hasVariant ? (
                      <EditableCell
                        value={price ?? 0}
                        type="number"
                        min={0}
                        formatDisplay={formatPrice}
                        onSave={async (newPrice) => {
                          await updateVariant.mutateAsync({
                            id: primaryVariant.id,
                            data: { price: Number(newPrice) },
                          });
                        }}
                      />
                    ) : (
                      <span className="px-2 py-1 text-sm text-gray-400">—</span>
                    )}
                  </td>
                  {/* AC-09: Stock — editable → PATCH /api/product-variants/:id */}
                  <td className="px-4 py-3 text-right">
                    {hasVariant ? (
                      <EditableCell
                        value={stock ?? 0}
                        type="number"
                        min={0}
                        requireInteger
                        formatDisplay={(v) => `${v} u.`}
                        onSave={async (newStock) => {
                          await updateVariant.mutateAsync({
                            id: primaryVariant.id,
                            data: { stock: Number(newStock) },
                          });
                        }}
                      />
                    ) : (
                      <span className="px-2 py-1 text-sm text-gray-400">—</span>
                    )}
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

      {/* Mobile card list — read-only (scope fence: mobile not editable) */}
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
                    {formatPrice(price)}
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
