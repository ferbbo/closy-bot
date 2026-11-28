/**
 * Rangos de fecha del reporte (S4.3-T3) en la zona horaria IANA del comercio,
 * solo con Intl (sin dependencias nuevas). Devuelven instantes UTC [start, end).
 */

export type ReportPeriod = 'day' | 'month';

interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function localParts(
  at: Date,
  timezone: string,
): LocalDate & { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (ms) de la zona respecto a UTC en el instante `at` (Bogotá: -5 h). */
function offsetMs(at: Date, timezone: string): number {
  const p = localParts(at, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instante UTC de la medianoche local de la fecha dada (corrige un cambio de horario). */
export function zonedMidnight(d: LocalDate, timezone: string): Date {
  const guess = Date.UTC(d.year, d.month - 1, d.day);
  let ts = guess - offsetMs(new Date(guess), timezone);
  ts = guess - offsetMs(new Date(ts), timezone);
  return new Date(ts);
}

/** Rango [start, end) del día o del mes local en curso para `now`. */
export function reportRange(
  now: Date,
  timezone: string,
  period: ReportPeriod,
): { start: Date; end: Date } {
  const { year, month, day } = localParts(now, timezone);
  if (period === 'day') {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return {
      start: zonedMidnight({ year, month, day }, timezone),
      end: zonedMidnight(
        { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() },
        timezone,
      ),
    };
  }
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: zonedMidnight({ year, month, day: 1 }, timezone),
    end: zonedMidnight({ ...nextMonth, day: 1 }, timezone),
  };
}

/** Etiqueta local "28/11/2026" o "11/2026". */
export function periodLabel(now: Date, timezone: string, period: ReportPeriod): string {
  const { year, month, day } = localParts(now, timezone);
  const mm = String(month).padStart(2, '0');
  return period === 'day' ? `${String(day).padStart(2, '0')}/${mm}/${year}` : `${mm}/${year}`;
}
