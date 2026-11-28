import {
  collectAllowedFromToolData,
  extractAmounts,
  extractDigitSequences,
  extractMinutes,
  GroundingValidator,
} from './grounding-validator';

describe('GroundingValidator (RN-28)', () => {
  const validator = new GroundingValidator();

  describe('extractors', () => {
    it.each([
      ['van $32.000 en total', [32000]],
      ['el domicilio vale $4000', [4000]],
      ['pagas con 50 mil', [50000]],
      ['con 50k está bien', [50000]],
      ['sería 28.000 pesos', [28000]],
      ['2 hamburguesas y 1 coca', []],
    ])('amounts in %j → %j', (text, expected) => {
      expect(extractAmounts(text).sort()).toEqual(expected);
    });

    it('minutes', () => {
      expect(extractMinutes('te llega en unos 45 minutos (o 50 min)')).toEqual([45, 50]);
    });

    it('digit sequences ≥ 6 ignore spaces and money, keep addresses short', () => {
      expect(extractDigitSequences('Nequi 300 000 0001, total $36.000, cra 27 #45-12')).toEqual([
        '3000000001',
      ]);
    });
  });

  describe('check', () => {
    const toolData = [
      {
        lines: [{ label: 'Hamburguesa sencilla', unitPrice: 14000, lineTotal: 28000 }],
        subtotal: 32000,
      },
      { ok: true, fee: 4000, etaMinutes: 45, zoneName: 'Cabecera' },
      { total: 36000 },
      {
        payments: [
          { type: 'transfer', instructions: 'Nequi 300 000 0001 a nombre de Burger Barrio SAS' },
        ],
        policies: { privacyUrl: 'https://example.com/privacidad' },
      },
    ];
    const allowed = collectAllowedFromToolData(toolData);

    it('accepts a reply that only quotes figures returned by tools', () => {
      const text =
        'Listo, van $32.000. A Cabecera el domicilio vale $4.000 y llega en unos 45 minutos; total $36.000.';
      expect(validator.check(text, allowed)).toEqual({ ok: true });
    });

    it('AC-33: rejects an invented total ($40.000 when the real one is $36.000)', () => {
      const res = validator.check('El total es $40.000', allowed);
      expect(res).toEqual({ ok: false, invalidFigures: ['$40000'] });
    });

    it('rejects invented ETA minutes', () => {
      expect(validator.check('te llega en 20 min', allowed)).toEqual({
        ok: false,
        invalidFigures: ['20 min'],
      });
    });

    it('AC-42: accepts the literal account from paymentMethods and rejects an invented one', () => {
      expect(validator.check('Transfiere a Nequi 300 000 0001', allowed)).toEqual({ ok: true });
      expect(validator.check('Transfiere a Nequi 311 222 3344', allowed)).toEqual({
        ok: false,
        invalidFigures: ['3112223344'],
      });
    });

    it('AC-39: rejects URLs not returned by tools', () => {
      expect(validator.check('Política: https://example.com/privacidad', allowed)).toEqual({
        ok: true,
      });
      expect(validator.check('Mira https://otra.com/promo', allowed).ok).toBe(false);
    });

    it('accepts text without figures', () => {
      expect(
        validator.check('¡Hola! ¿Qué se te antoja hoy?', { amounts: [], minutes: [] }),
      ).toEqual({ ok: true });
    });
  });
});
