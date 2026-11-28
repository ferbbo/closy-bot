import type { ModuleRef } from '@nestjs/core';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';

/**
 * Punto de extensión de comandos del encargado (CONTRACTS §2, S4.1).
 * El Integrador registra en DeliveryModule:
 *   { provide: DELIVERY_MERCHANT_COMMANDS, useFactory: (a, b) => [a, b], inject: [...] }
 * El servicio legacy (ServicesModule) NO importa DeliveryModule: resuelve el token y el flag en
 * caliente con `ModuleRef.get(..., { strict: false })` dentro de try/catch, así no hay ciclo de
 * módulos. Sin handlers o con el flag apagado el comportamiento legacy es idéntico.
 */
export const DELIVERY_MERCHANT_COMMANDS = Symbol('DELIVERY_MERCHANT_COMMANDS');

export interface DeliveryMerchantCommandHandler {
  /** Devuelve la respuesta para el encargado, o null si el texto no es un comando suyo. */
  tryHandle(merchantId: string, text: string): Promise<string | null>;
}

/** `isDeliveryEnabled` resuelto en caliente; false si el servicio no está en el contenedor. */
export function isDeliveryEnabledVia(moduleRef?: ModuleRef | null): boolean {
  if (!moduleRef) return false;
  try {
    return moduleRef.get(FeatureFlagsService, { strict: false }).isDeliveryEnabled === true;
  } catch {
    return false;
  }
}

/** Handlers registrados bajo DELIVERY_MERCHANT_COMMANDS (array o instancia); [] si no hay. */
export function resolveDeliveryCommandHandlers(
  moduleRef?: ModuleRef | null,
): DeliveryMerchantCommandHandler[] {
  if (!moduleRef) return [];
  try {
    const value: unknown = moduleRef.get(DELIVERY_MERCHANT_COMMANDS, { strict: false });
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list.filter(
      (h): h is DeliveryMerchantCommandHandler =>
        !!h && typeof (h as DeliveryMerchantCommandHandler).tryHandle === 'function',
    );
  } catch {
    return [];
  }
}
