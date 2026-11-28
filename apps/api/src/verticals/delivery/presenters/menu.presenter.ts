import { Injectable } from '@nestjs/common';

/** Formato de cifras COP del módulo: 16000 → "$16.000" (sin depender de ICU). */
export function formatCop(amount: number): string {
  const n = Math.round(amount);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export interface MenuCategoryView {
  name: string;
  items: Array<{ label: string; unitPrice: number }>;
}

export interface MenuPage {
  text: string;
  page: number; // 1-based
  totalPages: number;
}

/** AC-09: si el menú completo pasa de este tamaño se pagina. */
export const MENU_PAGE_MAX_CHARS = 1500;

/**
 * MenuPresenter — renderiza el menú (categorías con productos activos y precios de la BD,
 * RN-00/RN-01) en bloques de ≤ 1.500 caracteres. Puro: los datos llegan ya leídos en el turno.
 *
 * Paginado: se agrupan categorías completas por página; si una sola categoría no cabe,
 * se parte por líneas repitiendo el encabezado con "(cont.)".
 */
@Injectable()
export class MenuPresenter {
  paginate(categories: MenuCategoryView[], maxChars = MENU_PAGE_MAX_CHARS): string[] {
    const pages: string[] = [];
    let current = '';
    const push = (block: string) => {
      const joined = current ? `${current}\n\n${block}` : block;
      if (joined.length <= maxChars) {
        current = joined;
        return;
      }
      if (current) pages.push(current);
      current = block;
    };

    for (const cat of categories) {
      if (cat.items.length === 0) continue;
      const lines = cat.items.map((i) => `• ${i.label} — ${formatCop(i.unitPrice)}`);
      const block = [`*${cat.name}*`, ...lines].join('\n');
      if (block.length <= maxChars) {
        push(block);
        continue;
      }
      let chunk = `*${cat.name}*`;
      for (const line of lines) {
        if (`${chunk}\n${line}`.length > maxChars) {
          push(chunk);
          chunk = `*${cat.name} (cont.)*`;
        }
        chunk = `${chunk}\n${line}`;
      }
      push(chunk);
    }
    if (current) pages.push(current);
    return pages;
  }

  /** Página `page` (1-based, se acota al rango). `null` si no hay productos activos. */
  render(categories: MenuCategoryView[], page = 1): MenuPage | null {
    const pages = this.paginate(categories);
    if (pages.length === 0) return null;
    const p = Math.min(Math.max(1, Math.floor(page) || 1), pages.length);
    return { text: pages[p - 1], page: p, totalPages: pages.length };
  }
}
