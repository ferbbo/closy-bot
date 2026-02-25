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

// ---------------------------------------------------------------------------
// AC-12 (PR-05): INTENT_KEYWORDS.CHECKOUT — checkout trigger keywords
// ---------------------------------------------------------------------------

describe('AC-12 (PR-05): INTENT_KEYWORDS.CHECKOUT completeness', () => {
  it('AC-12: CHECKOUT has at least 5 keywords', () => {
    expect(INTENT_KEYWORDS.CHECKOUT.length).toBeGreaterThanOrEqual(5);
  });

  it('AC-12: all CHECKOUT keywords have valid weight (1-5)', () => {
    for (const kw of INTENT_KEYWORDS.CHECKOUT) {
      expect(kw.weight).toBeGreaterThanOrEqual(1);
      expect(kw.weight).toBeLessThanOrEqual(5);
      expect(typeof kw.phrase).toBe('string');
    }
  });

  it('AC-12: CHECKOUT includes "quiero pagar" with highest weight', () => {
    const kwConfig = INTENT_KEYWORDS.CHECKOUT.find((k) => k.phrase === 'quiero pagar');
    expect(kwConfig).toBeDefined();
    expect(kwConfig!.weight).toBe(5);
  });

  it('AC-12: CHECKOUT includes "checkout" and "finalizar" keywords', () => {
    const phrases = INTENT_KEYWORDS.CHECKOUT.map((k) => k.phrase);
    expect(phrases).toContain('checkout');
    expect(phrases.some((p) => p.includes('finalizar'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-05 (PR-08): INTENT_KEYWORDS.HANDOFF — human handoff trigger keywords
// ---------------------------------------------------------------------------

describe('AC-05 (PR-08): INTENT_KEYWORDS.HANDOFF completeness', () => {
  it('AC-05: HANDOFF has at least 5 keywords', () => {
    expect(INTENT_KEYWORDS.HANDOFF.length).toBeGreaterThanOrEqual(5);
  });

  it('AC-05: all HANDOFF keywords have valid weight (1-5)', () => {
    for (const kw of INTENT_KEYWORDS.HANDOFF) {
      expect(kw.weight).toBeGreaterThanOrEqual(1);
      expect(kw.weight).toBeLessThanOrEqual(5);
      expect(typeof kw.phrase).toBe('string');
      expect(kw.phrase.length).toBeGreaterThan(0);
    }
  });

  it('AC-05: HANDOFF includes "hablar con alguien" with highest weight (5)', () => {
    const kw = INTENT_KEYWORDS.HANDOFF.find((k) => k.phrase === 'hablar con alguien');
    expect(kw).toBeDefined();
    expect(kw!.weight).toBe(5);
  });

  it('AC-05: HANDOFF includes "quiero persona" with high weight', () => {
    const kw = INTENT_KEYWORDS.HANDOFF.find((k) => k.phrase === 'quiero persona');
    expect(kw).toBeDefined();
    expect(kw!.weight).toBeGreaterThanOrEqual(4);
  });

  it('AC-05: HANDOFF includes "atencion humana" keyword', () => {
    const phrases = INTENT_KEYWORDS.HANDOFF.map((k) => k.phrase);
    expect(phrases.some((p) => p.includes('atencion humana') || p.includes('atención humana'))).toBe(true);
  });

  it('AC-05: HANDOFF keywords have distinct phrases (no duplicates)', () => {
    const phrases = INTENT_KEYWORDS.HANDOFF.map((k) => k.phrase);
    const unique = new Set(phrases);
    expect(unique.size).toBe(phrases.length);
  });
});

