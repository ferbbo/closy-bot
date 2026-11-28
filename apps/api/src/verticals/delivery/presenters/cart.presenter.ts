import { Injectable } from '@nestjs/common';
import type { CartWithItems } from '../../../persistence/repositories/cart.repository';
import type { CartLineView, CartView } from '../contracts';

/** Nombres de variante que no aportan información al cliente ("Hamburguesa sencilla", no "… - Única"). */
const PLACEHOLDER_VARIANT_NAMES = new Set([
  '',
  'unica',
  'unico',
  'default',
  'estandar',
  'standard',
  'normal',
]);

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Formato de cifras del módulo (CLAUDE.md §6): `$28.000`.
 * Determinista (no depende de los datos ICU del runtime); COP sin decimales.
 */
export function formatCop(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${digits}`;
}

/** Etiqueta visible de una línea: producto + variante (si la variante no es un placeholder). */
export function cartLineLabel(productName: string, variantName: string): string {
  const variant = variantName.trim();
  if (PLACEHOLDER_VARIANT_NAMES.has(plain(variant)) || plain(variant) === plain(productName)) {
    return productName.trim();
  }
  return `${productName.trim()} ${variant}`;
}

/**
 * CartPresenter (S2.2-T3) — única fuente de las cifras del carrito que ve el cliente (RN-01).
 * Todo sale de la BD: `priceSnapshot` y `quantity` de cada CartItem; el subtotal es su suma.
 */
@Injectable()
export class CartPresenter {
  toView(cart: CartWithItems): CartView {
    const lines: CartLineView[] = cart.items.map((item) => {
      const unitPrice = Number(item.priceSnapshot);
      return {
        itemId: item.id,
        label: cartLineLabel(item.variant.product.name, item.variant.name),
        notes: item.notes ?? '',
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    return { cartId: cart.id, lines, subtotal };
  }

  /** Bloque de texto exacto para el cliente (las notas son visibles, AC-08). */
  render(view: CartView): string {
    if (view.lines.length === 0) return 'Tu carrito está vacío.';
    const rows = view.lines.map((line) => {
      const notes = line.notes ? ` (${line.notes})` : '';
      return `• ${line.quantity}× ${line.label}${notes} — ${formatCop(line.lineTotal)}`;
    });
    return [...rows, `Subtotal: ${formatCop(view.subtotal)}`].join('\n');
  }
}
