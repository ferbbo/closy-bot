import { Injectable } from '@nestjs/common';
import { CatalogService } from '../../../services/catalog.service';
import type { ProductWithVariants } from '../../../persistence/repositories/product.repository';
import { normalizeText } from '../config/delivery-config.service';
import { MatchResult, VariantCandidate } from '../contracts';

/**
 * Nombres de variante "genéricos" que no aportan información al cliente: el label
 * queda solo con el nombre del producto ("Hamburguesa sencilla", no "Hamburguesa sencilla Única").
 * Se comparan normalizados (minúsculas, sin tildes).
 */
const GENERIC_VARIANT_NAMES = new Set([
  'unica',
  'unico',
  'porcion',
  'normal',
  'estandar',
  'regular',
  'default',
]);

/** Palabras vacías que no cuentan para el puntaje (artículos, preposiciones, cortesía). */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'uno', 'unos', 'unas', 'y', 'con', 'en',
  'por', 'para', 'al', 'me', 'quiero', 'regalame', 'mandame', 'porfa', 'favor',
]); // prettier-ignore

/** MATCHED exige que el mejor supere al segundo por al menos este margen (0..1). */
export const MATCH_MARGIN = 0.2;
/** …y que cubra al menos esta fracción de las palabras de la consulta. */
export const MATCH_MIN_SCORE = 0.5;

/** Singular simple en español: "hamburguesas" → "hamburguesa", "salsas" → "salsa". */
function singular(token: string): string {
  if (token.length > 4 && token.endsWith('es') && !/[aeiou]es$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(singular);
}

/** Label visible de una variante (ver GENERIC_VARIANT_NAMES). */
export function variantLabel(productName: string, variantName: string): string {
  const v = normalizeText(variantName);
  if (!v || GENERIC_VARIANT_NAMES.has(v) || v === normalizeText(productName)) return productName;
  return `${productName} ${variantName}`;
}

/** Fracción de palabras de la consulta presentes en producto + variante + tags (0..1, 2 decimales). */
function scoreOf(queryTokens: string[], product: ProductWithVariants, variantName: string): number {
  if (queryTokens.length === 0) return 0;
  const haystack = new Set(
    tokenize([product.name, variantName, ...(product.tags ?? [])].join(' ')),
  );
  const hits = queryTokens.filter((t) => haystack.has(t)).length;
  return Math.round((hits / queryTokens.length) * 100) / 100;
}

/**
 * CatalogMatcherService — convierte texto libre en candidatos de variante (RN-00: siempre
 * consulta la BD vía `CatalogService.searchProducts`, sin caché).
 *
 * Regla de clasificación (umbral relativo):
 * - Sin variantes activas → NOT_FOUND.
 * - El puntaje es la fracción de palabras de la consulta (normalizadas, en singular, sin
 *   palabras vacías) que aparecen en nombre del producto, nombre de la variante o tags.
 *   Así "coca 400" puntúa 1.0 para "Coca-Cola 400 ml" y 0.5 para "Coca-Cola 1.5 L".
 *   Si algún candidato puntúa > 0, se descartan los de puntaje 0 (ruido del FTS / trigram).
 *   Empates conservan el orden de relevancia del FTS.
 * - 1 candidato → MATCHED.
 * - El primero ≥ MATCH_MIN_SCORE y supera al segundo por ≥ MATCH_MARGIN → MATCHED.
 * - Si no → AMBIGUOUS con hasta `limit` (máx. 5) candidatos.
 */
@Injectable()
export class CatalogMatcherService {
  constructor(private readonly catalogService: CatalogService) {}

  async search(merchantId: string, query: string, limit = 5): Promise<MatchResult> {
    const max = Math.min(Math.max(1, limit), 5);
    const trimmed = query.trim();
    if (!trimmed) return { status: 'NOT_FOUND', query };

    const products = await this.catalogService.searchProducts(merchantId, trimmed, max);
    const queryTokens = tokenize(trimmed);

    let candidates: VariantCandidate[] = [];
    for (const product of products) {
      if (!product.isActive) continue;
      for (const variant of product.variants) {
        if (!variant.isActive) continue;
        candidates.push({
          variantId: variant.id,
          productId: product.id,
          label: variantLabel(product.name, variant.name),
          unitPrice: Number(variant.price),
          score: scoreOf(queryTokens, product, variant.name),
        });
      }
    }

    if (candidates.some((c) => c.score > 0)) candidates = candidates.filter((c) => c.score > 0);
    // sort estable: a igual puntaje se mantiene el orden del FTS
    candidates.sort((a, b) => b.score - a.score);
    candidates = candidates.slice(0, max);

    if (candidates.length === 0) return { status: 'NOT_FOUND', query };
    const [first, second] = candidates;
    if (
      candidates.length === 1 ||
      (first.score >= MATCH_MIN_SCORE && first.score - second.score >= MATCH_MARGIN - 1e-9)
    ) {
      return { status: 'MATCHED', query, candidate: first };
    }
    return { status: 'AMBIGUOUS', query, candidates };
  }
}
