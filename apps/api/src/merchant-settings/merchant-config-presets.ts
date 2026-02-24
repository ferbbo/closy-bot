/**
 * PR-04.5: MerchantConfig industry presets
 * Default configuration per industry (ropa, belleza, minimarket)
 */
import { MerchantConfigData } from '../../domain/entities/merchant-config.interface';

export const MERCHANT_CONFIG_PRESETS: Record<string, MerchantConfigData> = {
  ropa: {
    paymentMethods: [
      { type: 'cod', label: 'Contraentrega' },
      { type: 'transfer', label: 'Transferencia bancaria' },
    ],
    shippingConfig: {
      flatRate: 10000,
      estimatedDays: '3-5 días hábiles',
    },
    returnPolicy:
      'Aceptamos cambios hasta 10 días después de recibir tu pedido. El producto debe estar sin usar, con etiquetas.',
    currency: 'COP',
    orderCodePrefix: 'ORD',
    autoConfirmCod: true,
  },

  belleza: {
    paymentMethods: [
      { type: 'cod', label: 'Contraentrega' },
      { type: 'transfer', label: 'Transferencia' },
      { type: 'payment_link', label: 'Pagar con tarjeta' },
    ],
    shippingConfig: {
      freeAbove: 50000,
      estimatedDays: '2-4 días hábiles',
    },
    returnPolicy:
      'No aceptamos devoluciones de productos de cuidado personal por razones de higiene.',
    currency: 'COP',
    orderCodePrefix: 'ORDEN',
    autoConfirmCod: true,
  },

  minimarket: {
    paymentMethods: [{ type: 'cod', label: 'Pago en entrega' }],
    shippingConfig: {
      estimatedDays: 'Entrega el mismo día',
    },
    returnPolicy: 'No aceptamos devoluciones.',
    currency: 'COP',
    orderCodePrefix: 'PED',
    autoConfirmCod: true,
  },
};

/** Fallback preset when merchant has no industry set */
export const DEFAULT_PRESET: MerchantConfigData = MERCHANT_CONFIG_PRESETS['ropa'];

/**
 * Get preset for the given industry key.
 * Falls back to 'ropa' preset if industry is unknown/null.
 */
export function getPresetForIndustry(industry: string | null | undefined): MerchantConfigData {
  if (!industry) return DEFAULT_PRESET;
  return MERCHANT_CONFIG_PRESETS[industry] ?? DEFAULT_PRESET;
}
