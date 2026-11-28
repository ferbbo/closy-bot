import { Injectable } from '@nestjs/common';
import type {
  GroundingCheck,
  GroundingValidator as GroundingValidatorContract,
} from '../contracts';

/**
 * Lo permitido en un turno: todo sale de resultados de herramientas del turno (BD, RN-00).
 * `amounts`/`minutes` son el contrato congelado; el resto extiende RN-28.
 */
export interface GroundingAllowed {
  amounts: number[];
  minutes: number[];
  /** Secuencias de dígitos (≥ 6) normalizadas: cuentas, llaves, teléfonos. */
  digitSequences?: string[];
  urls?: string[];
}

const URL_RE = /https?:\/\/[^\s)<>"']+/gi;
const MINUTES_RE = /(\d{1,3})\s*(?:min\b|mins\b|minutos?\b)/gi;
const MONEY_RE = /\$\s?(\d{1,3}(?:[.,]\d{3})+|\d+)/g;
const MIL_RE = /(\d{1,3}(?:[.,]\d{3})*|\d+)\s?(?:mil\b|k\b|lucas?\b)/gi;
const THOUSANDS_RE = /(?<![\d$.,])(\d{1,3}(?:\.\d{3})+)(?![\d.,]*\d)/g;
const DIGIT_SEQ_RE = /\d(?:[\d \-.]*\d)?/g;

function toInt(raw: string): number {
  return Number(raw.replace(/[.,]/g, ''));
}

export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''));
}

export function extractMinutes(text: string): number[] {
  return [...text.matchAll(MINUTES_RE)].map((m) => Number(m[1]));
}

/** Montos: "$28.000", "$4000", "50 mil", "50k", "28.000". */
export function extractAmounts(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(MONEY_RE)) out.add(toInt(m[1]));
  for (const m of text.matchAll(MIL_RE)) out.add(toInt(m[1]) * 1000);
  for (const m of text.matchAll(THOUSANDS_RE)) out.add(toInt(m[1]));
  return [...out].filter((n) => Number.isFinite(n));
}

/** Secuencias de ≥ 6 dígitos (ignora espacios, guiones y puntos internos). Los montos no cuentan. */
export function extractDigitSequences(text: string): string[] {
  const withoutMoney = text
    .replace(URL_RE, ' ')
    .replace(MONEY_RE, ' ')
    .replace(MIL_RE, ' ')
    .replace(THOUSANDS_RE, ' ');
  return (withoutMoney.match(DIGIT_SEQ_RE) ?? [])
    .map((s) => s.replace(/\D/g, ''))
    .filter((s) => s.length >= 6);
}

/** Lo permitido a partir de los `data` devueltos por las herramientas del turno. */
export function collectAllowedFromToolData(data: unknown[]): Required<GroundingAllowed> {
  const amounts = new Set<number>();
  const minutes = new Set<number>();
  const digits = new Set<string>();
  const urls = new Set<string>();

  const visit = (value: unknown, key: string, depth: number): void => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (/eta|minute|minuto|prep/i.test(key)) minutes.add(Math.round(value));
      amounts.add(value);
      if (Number.isInteger(value) && value >= 100000) digits.add(String(value));
      return;
    }
    if (typeof value === 'string') {
      extractUrls(value).forEach((u) => urls.add(u));
      extractDigitSequences(value).forEach((s) => digits.add(s));
      extractAmounts(value).forEach((a) => amounts.add(a));
      extractMinutes(value).forEach((m) => minutes.add(m));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, key, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, k, depth + 1);
    }
  };
  data.forEach((d) => visit(d, '', 0));
  return {
    amounts: [...amounts],
    minutes: [...minutes],
    digitSequences: [...digits],
    urls: [...urls],
  };
}

/**
 * GroundingValidator (RN-28): toda cifra, minuto de ETA, cuenta/llave/teléfono y URL del
 * texto del LLM debe existir en los resultados de herramientas del turno. Si no →
 * `invalidFigures` (sin PII: solo las cifras). Los nombres de producto se protegen por
 * construcción: el carrito y el resumen salen de presenters y `agregar_al_carrito` solo
 * acepta variantIds vistos (D-030).
 */
@Injectable()
export class GroundingValidator implements GroundingValidatorContract {
  check(text: string, allowed: GroundingAllowed): GroundingCheck {
    const invalid = new Set<string>();
    const amounts = new Set(allowed.amounts.map((n) => Math.round(n)));
    const minutes = new Set(allowed.minutes.map((n) => Math.round(n)));
    const digits = new Set(allowed.digitSequences ?? []);
    const urls = new Set((allowed.urls ?? []).map((u) => u.replace(/\/$/, '')));

    for (const amount of extractAmounts(text)) {
      if (!amounts.has(amount)) invalid.add(`$${amount}`);
    }
    for (const m of extractMinutes(text)) {
      if (!minutes.has(m)) invalid.add(`${m} min`);
    }
    for (const seq of extractDigitSequences(text)) {
      if (!digits.has(seq)) invalid.add(seq);
    }
    for (const url of extractUrls(text)) {
      if (!urls.has(url.replace(/\/$/, ''))) invalid.add(url);
    }
    return invalid.size === 0 ? { ok: true } : { ok: false, invalidFigures: [...invalid] };
  }
}
