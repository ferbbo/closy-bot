import { DeliveryConfig } from '../contracts';

/**
 * Defaults de la industria `restaurante` — SOLO parámetros técnicos (RN-00, corolario 2).
 *
 * Zonas, tarifas, mínimos, horario, tiempo de preparación, medios de pago y políticas
 * NO tienen default: quedan vacíos (`[]`, `0`, `null`) y el comercio queda
 * comercialmente incompleto hasta que los configure (ver `isCommerciallyComplete`).
 *
 * - `prepTimeMinutes = 0` significa "no configurado" (el contrato exige `number`).
 * - `pickupEnabled = false`: ofrecer recogida en el local es una decisión comercial.
 * - `maxOrderAmountWithoutHuman = 300000`: umbral de seguridad para revisión humana
 *   (RN-17 fija ese default); nunca se muestra al cliente como dato comercial.
 */
export function buildRestauranteDefaults(): DeliveryConfig {
  return {
    timezone: 'America/Bogota',
    openingHours: [],
    temporarilyClosed: false,
    prepTimeMinutes: 0,
    zones: [],
    freeDeliveryAbove: null,
    pickupEnabled: false,
    trackStock: false,
    maxQtyPerLine: 20,
    maxLines: 15,
    maxOrderAmountWithoutHuman: 300000,
    assistantName: null,
    toneHints: '',
    notifications: {
      mode: 'template_always',
      templateLanguage: 'es',
      maxBusinessInitiatedPerOrder: 6,
    },
    privacyPolicyUrl: null,
    menuImageUrl: null,
    pos: { provider: 'none', enabled: false, settings: {}, secretRef: null },
  };
}
