/**
 * AC-02 (PR-GAP-2): keyword-configs.spec.ts
 * Evidence: INTENT_KEYWORDS.QUERY_FAQ has 10+ keywords, all with weight 1-5
 */

import { INTENT_KEYWORDS } from './keyword-configs';

describe('AC-02 (PR-GAP-2): INTENT_KEYWORDS.QUERY_FAQ completeness', () => {
  it('AC-02: QUERY_FAQ has at least 10 keywords with weights', () => {
    expect(INTENT_KEYWORDS.QUERY_FAQ.length).toBeGreaterThanOrEqual(10);
  });

  it('AC-02: all QUERY_FAQ keywords have valid weight (1-5)', () => {
    for (const kw of INTENT_KEYWORDS.QUERY_FAQ) {
      expect(kw.weight).toBeGreaterThanOrEqual(1);
      expect(kw.weight).toBeLessThanOrEqual(5);
      expect(typeof kw.phrase).toBe('string');
      expect(kw.phrase.length).toBeGreaterThan(0);
    }
  });

  it('AC-02: QUERY_FAQ covers envio/pago/horario/devolucion topic groups', () => {
    const phrases = INTENT_KEYWORDS.QUERY_FAQ.map((k) => k.phrase);
    // Shipping keywords
    expect(phrases.some((p) => p.includes('envio') || p.includes('demora'))).toBe(true);
    // Payment keywords
    expect(phrases.some((p) => p.includes('pago') || p.includes('transferencia'))).toBe(true);
    // Hours keywords
    expect(phrases.some((p) => p.includes('horario') || p.includes('abierto'))).toBe(true);
    // Returns keywords
    expect(phrases.some((p) => p.includes('devolver') || p.includes('devolucion'))).toBe(true);
  });

  it('AC-02: QUERY_FAQ keywords have distinct phrases (no duplicates)', () => {
    const phrases = INTENT_KEYWORDS.QUERY_FAQ.map((k) => k.phrase);
    const unique = new Set(phrases);
    expect(unique.size).toBe(phrases.length);
  });
});
