import { CommercialCompleteness, DeliveryConfig } from '../contracts';

/** Lo mínimo de `MerchantConfig` que se necesita para evaluar completitud. */
export interface MerchantConfigLike {
  paymentMethods?: unknown;
}

/**
 * RN-00 corolario 2: sin zonas, horario, tiempo de preparación o medios de pago
 * en la BD, el comercio no cotiza ni confirma pedidos (handoff + alerta).
 */
export function isCommerciallyComplete(
  cfg: DeliveryConfig,
  merchantConfig: MerchantConfigLike | null | undefined,
): CommercialCompleteness {
  const missing: CommercialCompleteness['missing'] = [];
  if (!Array.isArray(cfg.zones) || cfg.zones.length === 0) missing.push('zones');
  if (!Array.isArray(cfg.openingHours) || cfg.openingHours.length === 0) {
    missing.push('openingHours');
  }
  if (!(typeof cfg.prepTimeMinutes === 'number' && cfg.prepTimeMinutes > 0)) {
    missing.push('prepTimeMinutes');
  }
  const pm = merchantConfig?.paymentMethods;
  if (!Array.isArray(pm) || pm.length === 0) missing.push('paymentMethods');
  return { complete: missing.length === 0, missing };
}
