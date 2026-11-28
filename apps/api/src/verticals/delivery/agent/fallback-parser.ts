import { ParsedOrderLine } from '../contracts';

/**
 * Fallback determinista (SPEC §3.5, AC-07): cuando el LLM falla o hace timeout, convierte
 * el texto del cliente en líneas `{query, quantity, notes}` que luego resuelve
 * `CatalogMatcherService`. No conoce el catálogo ni precios (RN-00): solo parte el texto.
 *
 * Reglas:
 * - Segmentos separados por "," ";" "+" " y " " e " o salto de línea.
 * - Cantidad al inicio: dígitos ("2", "2x"), palabras "un/una/uno … diez", "un par de" (2),
 *   "media docena (de)" (6), "(una) docena (de)" (12); o al final "x2". Sin cantidad ⇒ 1.
 *   Los números en medio o al final del nombre se conservan ("coca 400", "coca 1.5").
 * - Notas: desde la primera "sin" / "con" / "extra" hasta el final del segmento.
 * - Un segmento que empieza por "sin/con/extra", o que no trae cantidad explícita y sigue a una
 *   línea con notas, se suma a las notas de la línea anterior ("sin cebolla y sin tomate").
 * - Se quitan saludos y muletillas al inicio ("buenas", "me mandas", "regálame"…) y
 *   cortesías al final ("por favor", "porfa", "gracias").
 * - Se conservan tildes y se pasa a minúsculas (el FTS usa la config 'simple').
 */

const WORD_NUMBERS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}; // prettier-ignore

const LEADING_FILLER =
  /^(?:(?:hola|buenas(?: tardes| noches)?|buenos d[ií]as|veci(?:no|na)?|parce|pues|me (?:mandas?|regalas?|das|traes?|pones|env[ií]as?)|m[aá]ndame|reg[aá]lame|tr[aá]eme|env[ií]ame|ponme|dame|deme|quiero(?: pedir)?|quisiera|necesito|para pedir|porfa|por favor)(?=\s|$)\s*)+/;
const TRAILING_FILLER = /(?:\s+(?:por favor|porfa|plis|pls|gracias))+$/;
const SEPARATORS = /\s*(?:[,;+\n]|\s(?:y|e)\s)\s*/;
const NOTE_MARKER = /(?:^|\s)(sin|con|extra)(?=\s|$)/;

function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Cantidad explícita al inicio o final del segmento; `null` si no hay. */
function extractQuantity(segment: string): { quantity: number | null; rest: string } {
  let m = /^media docena(?:\s+de)?\s+(.+)$/.exec(segment);
  if (m) return { quantity: 6, rest: m[1] };
  m = /^(?:una\s+)?docena(?:\s+de)?\s+(.+)$/.exec(segment);
  if (m) return { quantity: 12, rest: m[1] };
  m = /^un par de\s+(.+)$/.exec(segment);
  if (m) return { quantity: 2, rest: m[1] };
  m = /^(\d+)\s*x?\s+(.+)$/.exec(segment);
  if (m) return { quantity: Number(m[1]), rest: m[2] };
  m = /^(\S+)\s+(.+)$/.exec(segment);
  if (m && WORD_NUMBERS[deaccent(m[1])] !== undefined) {
    return { quantity: WORD_NUMBERS[deaccent(m[1])], rest: m[2] };
  }
  m = /^(.+?)\s+x\s*(\d+)$/.exec(segment);
  if (m) return { quantity: Number(m[2]), rest: m[1] };
  return { quantity: null, rest: segment };
}

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[¡!¿?"]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // puntos que no son decimales
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function parseOrderText(text: string): ParsedOrderLine[] {
  const lines: ParsedOrderLine[] = [];
  const segments = clean(text ?? '').split(SEPARATORS);
  for (const raw of segments) {
    const segment = raw.replace(LEADING_FILLER, '').replace(TRAILING_FILLER, '').trim();
    if (!segment) continue;
    const { quantity, rest } = extractQuantity(segment);
    const marker = NOTE_MARKER.exec(rest);
    const query = (marker ? rest.slice(0, marker.index) : rest).trim();
    const notes = marker ? rest.slice(marker.index).trim() : '';
    const prev = lines[lines.length - 1];

    const continuation = prev && (!query || (quantity === null && prev.notes !== ''));
    if (continuation) {
      const extra = [query, notes].filter(Boolean).join(' ');
      prev.notes = prev.notes ? `${prev.notes} y ${extra}` : extra;
      continue;
    }
    if (!query || quantity === 0) continue;
    lines.push({ query, quantity: quantity ?? 1, notes });
  }
  return lines;
}
