import { Injectable } from '@nestjs/common';
import { DeliveryConfigService } from '../config/delivery-config.service';
import type {
  DeliveryConfig,
  ShippingQuote,
  ShippingQuoteInput,
  ShippingQuoteProvider,
} from '../contracts';

/** Segmentos de dirección que nunca son un barrio (apto 301, torre 2, casa 5...). */
const NOT_A_NEIGHBORHOOD =
  /^(apto|apartamento|apt|ap|torre|casa|piso|interior|int|bloque|bl|edificio|edif|local|oficina|of|conjunto|manzana|mz|lote)\b/i;

/** Separadores de barrio: coma, punto y coma, o guion/raya rodeado de espacios (no "#45-12"). */
const SEGMENT_SEPARATOR = /\s*[,;]\s*|\s+[-–—]\s+/;

/**
 * DeliveryQuoteService (S3.1-T1) — `ShippingQuoteProvider` del agente de domicilios.
 * Lee la config del comercio de la BD en cada llamada (RN-00) y delega RN-08 a RN-11 en
 * `DeliveryConfigService.quote`. Solo agrega la extracción del barrio desde la dirección.
 */
@Injectable()
export class DeliveryQuoteService implements ShippingQuoteProvider {
  constructor(private readonly deliveryConfig: DeliveryConfigService) {}

  async quote(input: ShippingQuoteInput): Promise<ShippingQuote> {
    return (await this.quoteWithConfig(input)).quote;
  }

  /** Igual que `quote`, devolviendo también la config leída (para no releer la BD). */
  async quoteWithConfig(
    input: ShippingQuoteInput,
  ): Promise<{ quote: ShippingQuote; config: DeliveryConfig }> {
    const config = await this.deliveryConfig.get(input.merchantId);
    const neighborhood =
      input.neighborhood?.trim() || this.extractNeighborhood(config, input.address) || undefined;
    const quote = this.deliveryConfig.quote(config, {
      address: input.address,
      neighborhood,
      subtotal: input.subtotal,
      fulfillment: input.fulfillment,
    });
    return { quote, config };
  }

  /**
   * Barrio a partir de la dirección:
   * 1) nombre o alias de una zona contenido como palabras completas (RN-08);
   * 2) si no, el último segmento tras coma o guion que no sea "apto/torre/casa..." ni solo números.
   * Sin separador ni zona → `null` (el LLM debe pedir el barrio).
   */
  extractNeighborhood(cfg: DeliveryConfig, address: string | null | undefined): string | null {
    const text = address?.trim();
    if (!text) return null;
    const zone = this.deliveryConfig.resolveZone(cfg, text);
    if (zone) return zone.name;
    const segments = text.split(SEGMENT_SEPARATOR).map((s) => s.trim());
    for (let i = segments.length - 1; i >= 1; i--) {
      const segment = segments[i];
      if (/\p{L}/u.test(segment) && !NOT_A_NEIGHBORHOOD.test(segment)) return segment;
    }
    return null;
  }
}
