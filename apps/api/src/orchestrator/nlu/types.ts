/**
 * NLU Entity Extraction types (PR-SEARCH-NLU)
 * B2 feature gated by FEATURE_SEARCH_NLU flag
 */

export interface SearchFilters {
  priceMin?: number;
  priceMax?: number;
  size?: string;
  color?: string;
}

export interface ParsedQuery {
  /** Query text with extracted entities removed — safe to pass to FTS */
  cleanText: string;
  /** Structured filters extracted from query */
  filters: SearchFilters;
}

/** 30 base colors for Levenshtein-based color extraction */
export const COLOR_DICT: readonly string[] = [
  'blanco',
  'negro',
  'rojo',
  'azul',
  'verde',
  'amarillo',
  'rosa',
  'morado',
  'naranja',
  'gris',
  'café',
  'beige',
  'crema',
  'dorado',
  'plateado',
  'turquesa',
  'coral',
  'lavanda',
  'menta',
  'celeste',
  'marino',
  'vino',
  'mostaza',
  'oliva',
  'terracota',
  'salmon',
  'lila',
  'fucsia',
  'cian',
  'magenta',
] as const;

/** Standard size tokens (letter sizes + numeric jeans sizes) */
export const SIZE_LIST: readonly string[] = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  '28',
  '29',
  '30',
  '32',
  '34',
  '36',
  '38',
  '40',
  '42',
  '44',
] as const;
