import { parseCashAmount } from './payment.tools';

describe('parseCashAmount (AC-13)', () => {
  it.each([
    ['50 mil', 50000],
    ['50.000', 50000],
    ['50k', 50000],
    ['50K', 50000],
    ['con 50', 50000],
    ['$100.000', 100000],
    ['pago con un billete de 100.000 pesos', 100000],
    ['50000', 50000],
    ['1.500.000', 1500000],
    ['20 lucas', 20000],
    ['2,5 mil', 2500],
  ])('"%s" → %d', (text, expected) => {
    expect(parseCashAmount(text)).toBe(expected);
  });

  it.each([
    [50, 50000],
    [50000, 50000],
  ])('número %d → %d', (n, expected) => {
    expect(parseCashAmount(n)).toBe(expected);
  });

  it.each(['', 'exacto', 'mil', '0', -5, null, undefined, {}])('sin monto %p → null', (v) => {
    expect(parseCashAmount(v)).toBeNull();
  });
});
