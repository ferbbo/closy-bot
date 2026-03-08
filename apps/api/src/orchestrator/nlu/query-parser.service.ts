import { Injectable, Logger } from '@nestjs/common';
import { COLOR_DICT, ParsedQuery, SearchFilters, SIZE_LIST } from './types';

/**
 * QueryParserService — NLU Entity Extraction (PR-SEARCH-NLU, B2 only)
 *
 * Extracts structured filters (price, size, color) from free-text queries
 * using Regex and inline Levenshtein. No external ML / npm packages.
 *
 * AC-01: Precio min/max/rango con notación k
 * AC-02: Talla con lista fija SIZE_LIST
 * AC-03: Color con Levenshtein ≤ 2 contra COLOR_DICT
 * AC-04: cleanText elimina entidades extraídas
 */
@Injectable()
export class QueryParserService {
  private readonly logger = new Logger(QueryParserService.name);

  /** Max Levenshtein distance for color fuzzy-matching */
  private readonly MAX_COLOR_DISTANCE = 2;

  /**
   * AC-01..AC-04: Parse a free-text query and extract structured filters.
   * Returns cleanText (for FTS) and filters object.
   */
  parse(query: string): ParsedQuery {
    let text = query.trim();
    const filters: SearchFilters = {};

    // 1. Price range: "80-120k", "80 a 120k" (must run before min/max to avoid partial match)
    text = this.extractPriceRange(text, filters);

    // 2. Price min: "desde 85000", "desde 85k"
    if (filters.priceMin === undefined) {
      text = this.extractPriceMin(text, filters);
    }

    // 3. Price max: "hasta 100000", "hasta 100k"
    if (filters.priceMax === undefined) {
      text = this.extractPriceMax(text, filters);
    }

    // 4. Size: "talla 32", "talla M", "talla XL"
    text = this.extractSize(text, filters);

    // 5. Color: fuzzy match each word against COLOR_DICT
    text = this.extractColor(text, filters);

    const cleanText = text.replace(/\s{2,}/g, ' ').trim();

    this.logger.debug(
      `parse("${query}") → cleanText="${cleanText}" filters=${JSON.stringify(filters)}`,
    );

    return { cleanText, filters };
  }

  // ─── Private extraction helpers ──────────────────────────────────────────────

  private extractPriceRange(text: string, filters: SearchFilters): string {
    // "80-120k", "80k-120k", "80 a 120k", "80000 a 120000"
    const rangeRe = /(\d+k?)\s*(?:-|a)\s*(\d+k?)/i;
    const m = text.match(rangeRe);
    if (m) {
      const raw1 = m[1];
      const raw2 = m[2];
      // If second ends with k but first doesn't, propagate k to first ("80-120k" = 80k-120k)
      const firstHasK = raw1.toLowerCase().endsWith('k');
      const secondHasK = raw2.toLowerCase().endsWith('k');
      const effectiveFirst = !firstHasK && secondHasK ? raw1 + 'k' : raw1;
      filters.priceMin = this.parseAmount(effectiveFirst);
      filters.priceMax = this.parseAmount(raw2);
      text = text.replace(rangeRe, '');
    }
    return text;
  }

  private extractPriceMin(text: string, filters: SearchFilters): string {
    const re = /desde\s+(\d+k?)/i;
    const m = text.match(re);
    if (m) {
      filters.priceMin = this.parseAmount(m[1]);
      text = text.replace(re, '');
    }
    return text;
  }

  private extractPriceMax(text: string, filters: SearchFilters): string {
    const re = /hasta\s+(\d+k?)/i;
    const m = text.match(re);
    if (m) {
      filters.priceMax = this.parseAmount(m[1]);
      text = text.replace(re, '');
    }
    return text;
  }

  private extractSize(text: string, filters: SearchFilters): string {
    // "talla M", "talla 32", "talla XL" (case-insensitive)
    const sizeAlts = SIZE_LIST.map((s) => s).join('|');
    const re = new RegExp(`talla\\s+(${sizeAlts})`, 'i');
    const m = text.match(re);
    if (m) {
      filters.size = m[1].toUpperCase();
      text = text.replace(re, '');
    }
    return text;
  }

  private extractColor(text: string, filters: SearchFilters): string {
    const words = text.split(/\s+/);
    const matchedWords: string[] = [];

    for (const word of words) {
      const lw = word.toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
      if (lw.length < 3) continue;

      const closest = this.findClosestColor(lw);
      if (closest !== null) {
        filters.color = closest;
        matchedWords.push(word);
        break; // Only extract first color found
      }
    }

    if (matchedWords.length > 0) {
      // Remove matched color words from text
      for (const w of matchedWords) {
        text = text.replace(w, '');
      }
    }

    return text;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  /** Convert amount string with optional k suffix to numeric value */
  private parseAmount(raw: string): number {
    const lower = raw.toLowerCase();
    const hasK = lower.endsWith('k');
    const num = parseInt(lower.replace('k', ''), 10);
    return hasK ? num * 1000 : num;
  }

  /**
   * Find closest color in COLOR_DICT using a 3-stage approach:
   * 1. Exact match ("azul" → "azul")
   * 2. Spanish plural stripping + exact match ("azules"→"azul", "blancos"→"blanco")
   * 3. Levenshtein ≤ MAX_COLOR_DISTANCE with similarity ratio ≥ 0.75
   *    (catches 1-char typos/gender: "blancas"→"blanco", "negor"→"negro")
   *    Rejects false positives like "floral"→"coral" (dist=2, ratio=0.67 < 0.75)
   *
   * Short words (< 5 chars): exact match only to prevent "ropa"→"rosa".
   */
  private findClosestColor(word: string): string | null {
    // Stage 1: exact match
    if ((COLOR_DICT as readonly string[]).includes(word)) return word;

    // Short words: exact match only
    if (word.length < 5) return null;

    // Stage 2: strip Spanish plural suffix and try exact match
    const stripped = this.stripSpanishPlural(word);
    if (stripped !== word && (COLOR_DICT as readonly string[]).includes(stripped)) return stripped;

    // Stage 3: Levenshtein on the stripped form with strict ratio guard
    const base = stripped !== word ? stripped : word;
    let bestColor: string | null = null;
    let bestDist = Infinity;

    for (const color of COLOR_DICT) {
      const dist = this.levenshtein(base, color);
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = color;
      }
    }

    if (bestColor === null) return null;

    const MIN_RATIO = 0.75;
    const ratio = 1 - bestDist / Math.max(base.length, bestColor.length);
    return bestDist <= this.MAX_COLOR_DISTANCE && ratio >= MIN_RATIO ? bestColor : null;
  }

  /**
   * Strip common Spanish plural suffixes to normalize before color matching.
   * "azules"→"azul", "blancos"→"blanco", "rosas"→"rosa", "blancas"→"blanca"
   */
  private stripSpanishPlural(word: string): string {
    if (word.endsWith('es') && word.length > 4) return word.slice(0, -2); // azules→azul
    if (word.endsWith('os') && word.length > 3) return word.slice(0, -1); // blancos→blanco (s→o kept)
    if (word.endsWith('as') && word.length > 3) return word.slice(0, -1); // rosas→rosa
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);  // otros→otro
    return word;
  }

  /**
   * Inline Levenshtein distance — O(m×n), acceptable for short strings.
   * No external npm packages (requirement from brief).
   */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Quick exits
    if (m === 0) return n;
    if (n === 0) return m;

    // Only keep two rows to reduce memory
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array<number>(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1, // deletion
          curr[j - 1] + 1, // insertion
          prev[j - 1] + cost, // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }
}
