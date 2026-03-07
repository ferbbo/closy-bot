import { QueryParserService } from './query-parser.service';

/**
 * Unit tests for QueryParserService (PR-SEARCH-NLU)
 * AC-01: precio min/max/rango con notación k
 * AC-02: talla con lista fija SIZE_LIST
 * AC-03: color con Levenshtein ≤ 2
 * AC-04: cleanText elimina entidades extraídas
 * AC-09: cobertura combinados y sin filtros
 */
describe('QueryParserService', () => {
  let service: QueryParserService;

  beforeEach(() => {
    service = new QueryParserService();
  });

  // ─── AC-01: Precio ─────────────────────────────────────────────────────────

  describe('AC-01: precio min (desde)', () => {
    it('extrae priceMin y elimina token', () => {
      const result = service.parse('jeans desde 85000');
      expect(result.filters.priceMin).toBe(85000);
      expect(result.cleanText).toBe('jeans');
    });

    it('soporta notación 85k', () => {
      const result = service.parse('jeans desde 85k');
      expect(result.filters.priceMin).toBe(85000);
    });

    it('AC-01: extrae priceMax (hasta)', () => {
      const result = service.parse('camisas hasta 100k');
      expect(result.filters.priceMax).toBe(100000);
      expect(result.cleanText).toBe('camisas');
    });

    it('AC-01: sin precio — filters vacío para precio', () => {
      const result = service.parse('jeans azules');
      expect(result.filters.priceMin).toBeUndefined();
      expect(result.filters.priceMax).toBeUndefined();
    });
  });

  describe('AC-01: rango de precio', () => {
    it('extrae rango con guión: "80-120k"', () => {
      const result = service.parse('vestidos 80-120k');
      expect(result.filters.priceMin).toBe(80000);
      expect(result.filters.priceMax).toBe(120000);
      expect(result.cleanText).toBe('vestidos');
    });

    it('extrae rango con " a ": "80 a 120k"', () => {
      const result = service.parse('blusas 80 a 120k');
      expect(result.filters.priceMin).toBe(80000);
      expect(result.filters.priceMax).toBe(120000);
      expect(result.cleanText).toBe('blusas');
    });

    it('extrae rango sin k: "80000 a 120000"', () => {
      const result = service.parse('pantalones 80000 a 120000');
      expect(result.filters.priceMin).toBe(80000);
      expect(result.filters.priceMax).toBe(120000);
    });
  });

  // ─── AC-02: Talla ──────────────────────────────────────────────────────────

  describe('AC-02: talla', () => {
    it('"camisas talla 32" → size: "32"', () => {
      const result = service.parse('camisas talla 32');
      expect(result.filters.size).toBe('32');
      expect(result.cleanText).toBe('camisas');
    });

    it('"talla M" → size: "M"', () => {
      const result = service.parse('polera talla M');
      expect(result.filters.size).toBe('M');
      expect(result.cleanText).toBe('polera');
    });

    it('"talla XL" → size: "XL"', () => {
      const result = service.parse('zapatos talla XL');
      expect(result.filters.size).toBe('XL');
    });

    it('"talla XS" → size: "XS"', () => {
      const result = service.parse('camiseta talla XS');
      expect(result.filters.size).toBe('XS');
    });

    it('talla case-insensitive: "talla xl" → size: "XL"', () => {
      const result = service.parse('ropa talla xl');
      expect(result.filters.size).toBe('XL');
    });

    it('talla fuera de lista ("talla 50") → no extrae', () => {
      const result = service.parse('ropa talla 50');
      expect(result.filters.size).toBeUndefined();
    });

    it('sin talla — size no definido', () => {
      const result = service.parse('jeans');
      expect(result.filters.size).toBeUndefined();
    });
  });

  // ─── AC-03: Color (Levenshtein) ────────────────────────────────────────────

  describe('AC-03: color con Levenshtein', () => {
    it('"vestido blancas" → color: "blanco" (distancia 2: +s, a→o)', () => {
      const result = service.parse('vestido blancas');
      expect(result.filters.color).toBe('blanco');
      expect(result.cleanText).not.toContain('blancas');
    });

    it('"rojizas" → no extrae color (distancia > 2)', () => {
      // "rojizas" vs "rojo" = distancia 4
      const result = service.parse('blusas rojizas');
      // Levenshtein("rojizas", "rojo") = 4 > 2 → no match
      expect(result.filters.color).toBeUndefined();
    });

    it('"negro" exacto → color: "negro"', () => {
      const result = service.parse('jeans negro');
      expect(result.filters.color).toBe('negro');
    });

    it('"azul" exacto → color: "azul"', () => {
      const result = service.parse('camisa azul');
      expect(result.filters.color).toBe('azul');
    });

    it('color con typo leve: "blaco" (distancia 1) → color: "blanco"', () => {
      const result = service.parse('camisa blaco');
      expect(result.filters.color).toBe('blanco');
    });

    it('color con typo severo (distancia > 2) → no extrae', () => {
      const result = service.parse('camisa blancooooo');
      // "blancooooo" vs "blanco" = distancia 4 → no match
      expect(result.filters.color).toBeUndefined();
    });
  });

  // ─── AC-04: cleanText ──────────────────────────────────────────────────────

  describe('AC-04: cleanText elimina entidades extraídas', () => {
    it('"jeans desde 85000 talla 32" → cleanText: "jeans"', () => {
      const result = service.parse('jeans desde 85000 talla 32');
      expect(result.cleanText).toBe('jeans');
    });

    it('"camisas hasta 100k talla M" → cleanText: "camisas"', () => {
      const result = service.parse('camisas hasta 100k talla M');
      expect(result.cleanText).toBe('camisas');
    });

    it('query combinado complejo → cleanText correcto', () => {
      const result = service.parse('vestidos desde 50000 hasta 120000 talla 38 azul');
      expect(result.cleanText).toBe('vestidos');
      expect(result.filters.priceMin).toBe(50000);
      expect(result.filters.priceMax).toBe(120000);
      expect(result.filters.size).toBe('38');
      expect(result.filters.color).toBe('azul');
    });
  });

  // ─── AC-09: Combinados y sin filtros ───────────────────────────────────────

  describe('AC-09: query sin filtros (regresión)', () => {
    it('"jeans" → cleanText: "jeans", filters: {}', () => {
      const result = service.parse('jeans');
      expect(result.cleanText).toBe('jeans');
      expect(result.filters).toEqual({});
    });

    it('"camisas baratas" → cleanText preservado (no ingresa en filtros)', () => {
      const result = service.parse('camisas baratas');
      expect(result.cleanText).toBe('camisas baratas');
      expect(result.filters).toEqual({});
    });
  });

  describe('AC-09: combinados precio + talla + color', () => {
    it('combina los tres filtros correctamente', () => {
      const result = service.parse('jeans azules desde 85000 talla 32');
      expect(result.filters.priceMin).toBe(85000);
      expect(result.filters.size).toBe('32');
      expect(result.filters.color).toBe('azul');
      expect(result.cleanText).toBe('jeans');
    });
  });
});
