import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import {
  CommercialCompleteness,
  DeliveryConfig,
  DeliveryZone,
  OpenStatus,
  ShippingQuote,
  ShippingQuoteInput,
} from '../contracts';

export type QuoteInput = Omit<ShippingQuoteInput, 'merchantId'>;
import { validateDeliveryConfig } from './delivery-config.validator';
import { buildRestauranteDefaults } from './restaurante.defaults';
import { isCommerciallyComplete } from './commercial-completeness';

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const MINUTES_PER_DAY = 24 * 60;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** RN-08: minúsculas, sin tildes, solo letras/dígitos separados por un espacio. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Día de la semana (0 = domingo) y minuto del día de `now` en la zona horaria IANA. */
export function localDayAndMinutes(now: Date, timezone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return { day: DAY_INDEX[get('weekday')] ?? 0, minutes: hour * 60 + Number(get('minute')) };
}

/**
 * DeliveryConfigService — lee `MerchantConfig.deliveryConfig` (RN-00: la BD es la fuente)
 * y ofrece las reglas puras de horario (RN-07) y zona (RN-08).
 */
@Injectable()
export class DeliveryConfigService {
  private readonly logger = new Logger(DeliveryConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Defaults técnicos + override guardado. JSON inválido → warn (sin PII) y defaults. */
  async get(merchantId: string): Promise<DeliveryConfig> {
    return (await this.getWithCompleteness(merchantId)).config;
  }

  /** Config + completitud comercial (zonas, horario, preparación, medios de pago). */
  async getWithCompleteness(
    merchantId: string,
  ): Promise<{ config: DeliveryConfig; completeness: CommercialCompleteness }> {
    const row = await this.prisma.merchantConfig.findUnique({
      where: { merchantId },
      select: { deliveryConfig: true, paymentMethods: true },
    });
    const config = this.parseStored(merchantId, row?.deliveryConfig ?? null);
    return { config, completeness: isCommerciallyComplete(config, row) };
  }

  /** Parsea el JSON guardado; si es inválido, registra los paths (no los valores). */
  parseStored(merchantId: string, raw: unknown): DeliveryConfig {
    if (raw === null || raw === undefined) return buildRestauranteDefaults();
    const result = validateDeliveryConfig(raw);
    if (result.ok) return result.value;
    const paths = result.errors.map((e) => e.path || '(root)').join(', ');
    this.logger.warn(
      `Invalid stored deliveryConfig for merchant ${merchantId}; using technical defaults. Invalid paths: ${paths}`,
    );
    return buildRestauranteDefaults();
  }

  /**
   * RN-07: abierto si `now` (en `cfg.timezone`) cae dentro de alguna ventana.
   * `close < open` ⇒ la ventana cruza medianoche. `temporarilyClosed` ⇒ cerrado sin
   * próxima apertura (la reapertura es manual). Sin horario ⇒ cerrado.
   */
  isOpen(cfg: DeliveryConfig, now: Date): OpenStatus {
    if (cfg.temporarilyClosed || cfg.openingHours.length === 0) return { open: false };
    const { day, minutes } = localDayAndMinutes(now, cfg.timezone);
    const yesterday = (day + 6) % 7;
    for (const w of cfg.openingHours) {
      const open = toMinutes(w.open);
      const close = toMinutes(w.close);
      if (open < close) {
        if (w.day === day && minutes >= open && minutes < close) return { open: true };
      } else {
        if (w.day === day && minutes >= open) return { open: true };
        if (w.day === yesterday && minutes < close) return { open: true };
      }
    }
    let best: { at: number; day: number; time: string } | null = null;
    for (const w of cfg.openingHours) {
      const open = toMinutes(w.open);
      let offset = (w.day - day + 7) % 7;
      if (offset === 0 && open <= minutes) offset = 7;
      const at = offset * MINUTES_PER_DAY + open;
      if (!best || at < best.at) best = { at, day: w.day, time: w.open };
    }
    return best
      ? { open: false, nextOpening: { day: best.day, time: best.time } }
      : { open: false };
  }

  /**
   * RN-08: primera zona cuyo `name` o algún alias aparezca en el texto normalizado
   * como palabras completas. Sin coincidencia ⇒ `null`.
   */
  resolveZone(cfg: DeliveryConfig, text: string | null | undefined): DeliveryZone | null {
    if (!text) return null;
    const haystack = ` ${normalizeText(text)} `;
    if (haystack.trim().length === 0) return null;
    for (const zone of cfg.zones) {
      for (const candidate of [zone.name, ...zone.aliases]) {
        const needle = normalizeText(candidate);
        if (needle.length > 0 && haystack.includes(` ${needle} `)) return zone;
      }
    }
    return null;
  }

  /**
   * RN-09 a RN-11 (puro; las cifras salen de `cfg`, leído de la BD).
   * - pickup → tarifa 0, ETA = prepTimeMinutes, sin zona ni mínimo. Verificar
   *   `cfg.pickupEnabled` es responsabilidad del consumidor (fijar_entrega).
   * - sin barrio detectable → NEEDS_NEIGHBORHOOD; barrio sin zona → OUT_OF_COVERAGE.
   *   Si solo llega `address` y no contiene ninguna zona, se pide el barrio.
   * - subtotal (sin domicilio) < minOrder → BELOW_MINIMUM con `minOrder` y `missing`.
   * - tarifa 0 si `freeDeliveryAbove !== null && subtotal >= freeDeliveryAbove`.
   */
  quote(cfg: DeliveryConfig, input: QuoteInput): ShippingQuote {
    if (input.fulfillment === 'pickup') {
      return {
        ok: true,
        zoneId: null,
        zoneName: null,
        fee: 0,
        etaMinutes: cfg.prepTimeMinutes,
        fulfillment: 'pickup',
      };
    }
    const neighborhood = input.neighborhood?.trim() ?? '';
    const address = input.address?.trim() ?? '';
    if (!neighborhood && !address) return { ok: false, reason: 'NEEDS_NEIGHBORHOOD' };
    const zone = this.resolveZone(cfg, neighborhood || address);
    if (!zone) {
      return { ok: false, reason: neighborhood ? 'OUT_OF_COVERAGE' : 'NEEDS_NEIGHBORHOOD' };
    }
    if (input.subtotal < zone.minOrder) {
      return {
        ok: false,
        reason: 'BELOW_MINIMUM',
        minOrder: zone.minOrder,
        missing: zone.minOrder - input.subtotal,
      };
    }
    const free = cfg.freeDeliveryAbove !== null && input.subtotal >= cfg.freeDeliveryAbove;
    return {
      ok: true,
      zoneId: zone.id,
      zoneName: zone.name,
      fee: free ? 0 : zone.fee,
      etaMinutes: cfg.prepTimeMinutes + zone.etaMinutes,
      fulfillment: 'delivery',
    };
  }
}
