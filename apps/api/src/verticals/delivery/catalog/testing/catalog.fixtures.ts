import { Category } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { ProductWithVariants } from '../../../../persistence/repositories/product.repository';

/** Fixtures de catálogo (forma de `ProductWithVariants`) inspiradas en `prisma/seed-delivery.ts`. Solo tests. */
const T0 = new Date('2026-01-01T00:00:00Z');

export function fxCategory(id: string, name: string): Category {
  return { id, name, merchantId: 'm1', createdAt: T0, updatedAt: T0 };
}

export function fxProduct(
  id: string,
  name: string,
  categoryId: string,
  variants: Array<{ id: string; name: string; price: number; isActive?: boolean }>,
  opts: { tags?: string[]; isActive?: boolean } = {},
): ProductWithVariants {
  return {
    id,
    name,
    description: null,
    brand: null,
    tags: opts.tags ?? [],
    imageUrls: [],
    searchText: null,
    imageKey: null,
    imageUrl: null,
    categoryId,
    merchantId: 'm1',
    isActive: opts.isActive ?? true,
    createdAt: T0,
    updatedAt: T0,
    variants: variants.map((v) => ({
      id: v.id,
      productId: id,
      sku: v.id.toUpperCase(),
      name: v.name,
      price: new Decimal(v.price),
      stock: 100,
      isActive: v.isActive ?? true,
      createdAt: T0,
      updatedAt: T0,
    })),
  } as unknown as ProductWithVariants;
}

export const FX = {
  sencilla: fxProduct('p_sen', 'Hamburguesa sencilla', 'c_ham', [
    { id: 'v_sen', name: 'Única', price: 16000 },
  ], { tags: ['hamburguesa', 'burger', 'sencilla'] }),
  doble: fxProduct('p_dob', 'Hamburguesa doble', 'c_ham', [
    { id: 'v_dob', name: 'Única', price: 22000 },
  ], { tags: ['hamburguesa', 'burger', 'doble'] }),
  tocineta: fxProduct('p_toc', 'Hamburguesa de tocineta', 'c_ham', [
    { id: 'v_toc', name: 'Única', price: 19000 },
  ], { tags: ['hamburguesa', 'burger', 'tocineta'] }),
  coca: fxProduct('p_coca', 'Coca-Cola', 'c_beb', [
    { id: 'v_coca400', name: '400 ml', price: 4000 },
    { id: 'v_coca1500', name: '1.5 L', price: 8000 },
  ], { tags: ['coca', 'cocacola', 'gaseosa', 'bebida'] }),
  papas: fxProduct('p_papas', 'Papas fritas', 'c_adi', [
    { id: 'v_papas', name: 'Porción', price: 6000 },
  ], { tags: ['papas', 'adicion'] }),
}; // prettier-ignore

export const FX_CATEGORIES = [
  fxCategory('c_ham', 'Hamburguesas'),
  fxCategory('c_beb', 'Bebidas'),
  fxCategory('c_adi', 'Adiciones'),
];
