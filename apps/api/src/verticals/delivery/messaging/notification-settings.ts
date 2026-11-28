import type { DeliveryConfig } from '../contracts';

export type NotificationSettings = DeliveryConfig['notifications'];

/** Defaults técnicos (RN-00 corolario 2: nada comercial). */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  mode: 'template_always',
  templateLanguage: 'es',
  maxBusinessInitiatedPerOrder: 6,
};

/**
 * Lee `deliveryConfig.notifications` (JSON de MerchantConfig) con defaults locales.
 * TODO(Integrador): reemplazar por `DeliveryConfigService.get(merchantId).notifications` (S1.2).
 */
export function resolveNotificationSettings(deliveryConfig: unknown): NotificationSettings {
  const raw =
    deliveryConfig && typeof deliveryConfig === 'object'
      ? ((deliveryConfig as { notifications?: Partial<NotificationSettings> }).notifications ?? {})
      : {};
  const max = Number(raw.maxBusinessInitiatedPerOrder);
  return {
    mode: raw.mode === 'auto' ? 'auto' : 'template_always',
    templateLanguage:
      typeof raw.templateLanguage === 'string' && raw.templateLanguage.trim()
        ? raw.templateLanguage.trim()
        : DEFAULT_NOTIFICATION_SETTINGS.templateLanguage,
    maxBusinessInitiatedPerOrder:
      Number.isInteger(max) && max > 0
        ? max
        : DEFAULT_NOTIFICATION_SETTINGS.maxBusinessInitiatedPerOrder,
  };
}
