import { ConfigValidation, DeliveryConfig } from '../contracts';
import { buildRestauranteDefaults } from './restaurante.defaults';

type Errors = Array<{ path: string; message: string }>;
type Obj = Record<string, unknown>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
const MAX_MINUTES = 24 * 60;
const MAX_COP = 100_000_000;

const TOP_KEYS: Array<keyof DeliveryConfig> = [
  'timezone', 'openingHours', 'temporarilyClosed', 'prepTimeMinutes', 'zones',
  'freeDeliveryAbove', 'pickupEnabled', 'trackStock', 'maxQtyPerLine', 'maxLines',
  'maxOrderAmountWithoutHuman', 'assistantName', 'toneHints', 'notifications',
  'privacyPolicyUrl', 'menuImageUrl', 'pos',
]; // prettier-ignore
const ZONE_KEYS = ['id', 'name', 'aliases', 'fee', 'minOrder', 'etaMinutes'];
const WINDOW_KEYS = ['day', 'open', 'close'];
const NOTIF_KEYS = ['mode', 'templateLanguage', 'maxBusinessInitiatedPerOrder'];
const POS_KEYS = ['provider', 'enabled', 'settings', 'secretRef'];

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidTimezone(tz: unknown): boolean {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

class Checker {
  readonly errors: Errors = [];
  add(path: string, message: string): void {
    this.errors.push({ path, message });
  }
  keys(o: Obj, allowed: string[], base: string): void {
    for (const k of Object.keys(o)) {
      if (!allowed.includes(k)) this.add(base ? `${base}.${k}` : k, 'unknown field');
    }
  }
  int(v: unknown, path: string, min: number, max: number): void {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      this.add(path, `must be an integer between ${min} and ${max}`);
    }
  }
  bool(v: unknown, path: string): void {
    if (typeof v !== 'boolean') this.add(path, 'must be a boolean');
  }
  str(v: unknown, path: string, min: number, max: number, nullable = false): void {
    if (nullable && v === null) return;
    if (typeof v !== 'string' || v.trim().length < min || v.length > max) {
      this.add(path, `must be a string of ${min}-${max} characters${nullable ? ' or null' : ''}`);
    }
  }
  url(v: unknown, path: string): void {
    if (v === null) return;
    let ok = false;
    if (typeof v === 'string' && v.length <= 2048) {
      try {
        const u = new URL(v);
        ok = u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        ok = false;
      }
    }
    if (!ok) this.add(path, 'must be an http(s) URL or null');
  }
}

function checkWindows(c: Checker, v: unknown): void {
  if (!Array.isArray(v)) return c.add('openingHours', 'must be an array');
  v.forEach((w, i) => {
    const p = `openingHours[${i}]`;
    if (!isObj(w)) return c.add(p, 'must be an object');
    c.keys(w, WINDOW_KEYS, p);
    c.int(w.day, `${p}.day`, 0, 6);
    for (const k of ['open', 'close'] as const) {
      if (typeof w[k] !== 'string' || !HHMM.test(w[k] as string)) {
        c.add(`${p}.${k}`, 'must be a time in HH:mm format');
      }
    }
    if (typeof w.open === 'string' && w.open === w.close) {
      c.add(`${p}.close`, 'must be different from open');
    }
  });
}

function checkZones(c: Checker, v: unknown): void {
  if (!Array.isArray(v)) return c.add('zones', 'must be an array');
  const ids = new Set<string>();
  v.forEach((z, i) => {
    const p = `zones[${i}]`;
    if (!isObj(z)) return c.add(p, 'must be an object');
    c.keys(z, ZONE_KEYS, p);
    if (typeof z.id !== 'string' || !SLUG.test(z.id) || z.id.length > 64) {
      c.add(`${p}.id`, 'must be a lowercase slug (a-z, 0-9, -)');
    } else if (ids.has(z.id)) {
      c.add(`${p}.id`, 'must be unique');
    } else {
      ids.add(z.id);
    }
    c.str(z.name, `${p}.name`, 1, 100);
    if (!Array.isArray(z.aliases)) {
      c.add(`${p}.aliases`, 'must be an array of strings');
    } else {
      z.aliases.forEach((a, j) => c.str(a, `${p}.aliases[${j}]`, 1, 100));
    }
    c.int(z.fee, `${p}.fee`, 0, MAX_COP);
    c.int(z.minOrder, `${p}.minOrder`, 0, MAX_COP);
    c.int(z.etaMinutes, `${p}.etaMinutes`, 0, MAX_MINUTES);
  });
}

function checkNotifications(c: Checker, v: unknown): void {
  if (!isObj(v)) return c.add('notifications', 'must be an object');
  c.keys(v, NOTIF_KEYS, 'notifications');
  if (v.mode !== 'template_always' && v.mode !== 'auto') {
    c.add('notifications.mode', "must be 'template_always' or 'auto'");
  }
  c.str(v.templateLanguage, 'notifications.templateLanguage', 2, 10);
  c.int(v.maxBusinessInitiatedPerOrder, 'notifications.maxBusinessInitiatedPerOrder', 0, 50);
}

function checkPos(c: Checker, v: unknown): void {
  if (!isObj(v)) return c.add('pos', 'must be an object');
  c.keys(v, POS_KEYS, 'pos');
  c.str(v.provider, 'pos.provider', 1, 50);
  c.bool(v.enabled, 'pos.enabled');
  if (!isObj(v.settings) || Object.values(v.settings).some((s) => typeof s !== 'string')) {
    c.add('pos.settings', 'must be an object of string values');
  }
  if (v.secretRef !== null && (typeof v.secretRef !== 'string' || !ENV_NAME.test(v.secretRef))) {
    c.add('pos.secretRef', 'must be an environment variable NAME (A-Z, 0-9, _) or null');
  }
}

/** Valida un DeliveryConfig completo (sin merge). */
function check(cfg: Obj): Errors {
  const c = new Checker();
  c.keys(cfg, TOP_KEYS, '');
  if (!isValidTimezone(cfg.timezone)) c.add('timezone', 'must be a valid IANA time zone');
  checkWindows(c, cfg.openingHours);
  c.bool(cfg.temporarilyClosed, 'temporarilyClosed');
  c.int(cfg.prepTimeMinutes, 'prepTimeMinutes', 0, MAX_MINUTES);
  checkZones(c, cfg.zones);
  if (cfg.freeDeliveryAbove !== null) c.int(cfg.freeDeliveryAbove, 'freeDeliveryAbove', 1, MAX_COP);
  c.bool(cfg.pickupEnabled, 'pickupEnabled');
  c.bool(cfg.trackStock, 'trackStock');
  c.int(cfg.maxQtyPerLine, 'maxQtyPerLine', 1, 999);
  c.int(cfg.maxLines, 'maxLines', 1, 100);
  c.int(cfg.maxOrderAmountWithoutHuman, 'maxOrderAmountWithoutHuman', 1, MAX_COP);
  c.str(cfg.assistantName, 'assistantName', 1, 50, true);
  if (typeof cfg.toneHints !== 'string' || cfg.toneHints.length > 300) {
    c.add('toneHints', 'must be a string of at most 300 characters');
  }
  checkNotifications(c, cfg.notifications);
  c.url(cfg.privacyPolicyUrl, 'privacyPolicyUrl');
  c.url(cfg.menuImageUrl, 'menuImageUrl');
  checkPos(c, cfg.pos);
  return c.errors;
}

/**
 * Valida un override (parcial) de DeliveryConfig aplicado sobre `base`
 * (por defecto: defaults técnicos de restaurante). Merge superficial; `notifications`
 * y `pos` se mezclan un nivel; los arrays (`zones`, `openingHours`) se reemplazan.
 * Los `path` de los errores son relativos a DeliveryConfig (ej. `zones[0].fee`).
 */
export function validateDeliveryConfig(
  input: unknown,
  base: DeliveryConfig = buildRestauranteDefaults(),
): ConfigValidation {
  if (!isObj(input)) return { ok: false, errors: [{ path: '', message: 'must be an object' }] };
  const merged: Obj = { ...base, ...input };
  for (const k of ['notifications', 'pos'] as const) {
    if (isObj(input[k])) merged[k] = { ...base[k], ...(input[k] as Obj) };
  }
  const errors = check(merged);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: JSON.parse(JSON.stringify(merged)) as DeliveryConfig };
}
