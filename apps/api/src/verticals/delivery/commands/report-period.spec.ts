import { periodLabel, reportRange } from './report-period';

const TZ = 'America/Bogota';

describe('reportRange (AC-21, zona horaria del comercio)', () => {
  it('23:59 local en Bogotá (04:59Z del día siguiente) sigue siendo "hoy" local', () => {
    const now = new Date('2026-11-29T04:59:00Z'); // 28/11 23:59 en Bogotá
    const { start, end } = reportRange(now, TZ, 'day');
    expect(start.toISOString()).toBe('2026-11-28T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-29T05:00:00.000Z');
    expect(periodLabel(now, TZ, 'day')).toBe('28/11/2026');
  });

  it('00:00 local en Bogotá abre un día nuevo', () => {
    const now = new Date('2026-11-29T05:00:00Z'); // 29/11 00:00 en Bogotá
    const { start, end } = reportRange(now, TZ, 'day');
    expect(start.toISOString()).toBe('2026-11-29T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-30T05:00:00.000Z');
  });

  it('mes en curso: 31/12 23:30 local → diciembre completo (cruza año en UTC)', () => {
    const now = new Date('2027-01-01T04:30:00Z');
    const { start, end } = reportRange(now, TZ, 'month');
    expect(start.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T05:00:00.000Z');
    expect(periodLabel(now, TZ, 'month')).toBe('12/2026');
  });

  it('zona con horario de verano (Madrid, cambio 25/10/2026) mide el día con 25 h', () => {
    const { start, end } = reportRange(new Date('2026-10-25T12:00:00Z'), 'Europe/Madrid', 'day');
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});
