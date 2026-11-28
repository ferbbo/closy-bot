import { Injectable } from '@nestjs/common';
import { DeliveryConfigService } from '../../config/delivery-config.service';
import type { DeliveryConfig, OpenStatus, ToolHandler, ToolResult } from '../../contracts';

/**
 * Herramientas que crean o modifican carrito o checkout (RN-07). Las de lectura
 * (buscar_producto, ver_menu, consultar_negocio, ver_carrito) no están y pasan siempre (AC-10).
 */
export const DEFAULT_OPENING_HOURS_GUARDED_TOOLS: readonly string[] = [
  'agregar_al_carrito',
  'quitar_del_carrito',
  'fijar_entrega',
  'cotizar_domicilio',
  'fijar_pago',
  'resumen_pedido',
  'confirmar_pedido',
];

export type IsOpenFn = (cfg: DeliveryConfig, now: Date) => OpenStatus;

/** Resultado de una herramienta bloqueada: el LLM redacta la próxima apertura con este dato. */
export function storeClosedResult(cfg: DeliveryConfig, status: OpenStatus): ToolResult {
  return {
    ok: false,
    error: 'STORE_CLOSED',
    data: {
      proximaApertura: status.nextOpening ?? null,
      temporalmenteCerrado: cfg.temporarilyClosed,
    },
  };
}

/**
 * Envuelve un registro de handlers: las herramientas de `guarded` devuelven `STORE_CLOSED`
 * (sin ejecutar el handler, es decir, sin tocar el carrito) si `isOpen(ctx.config, ctx.now)`
 * es cerrado o `temporarilyClosed`. El horario se evalúa por llamada con la config del turno
 * (RN-00). Nunca lanza más allá de lo que lance el handler envuelto.
 */
export function withOpeningHoursGuard(
  handlers: Record<string, ToolHandler>,
  isOpen: IsOpenFn,
  guarded: readonly string[] = DEFAULT_OPENING_HOURS_GUARDED_TOOLS,
): Record<string, ToolHandler> {
  const guardedSet = new Set(guarded);
  const wrapped: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = guardedSet.has(name)
      ? async (args, ctx) => {
          const status = isOpen(ctx.config, ctx.now);
          if (!status.open || ctx.config.temporarilyClosed) {
            return storeClosedResult(ctx.config, status);
          }
          return handler(args, ctx);
        }
      : handler;
  }
  return wrapped;
}

/**
 * Guard de horario (S3.2-T1, RN-07, AC-10). El Integrador lo aplica en el agente:
 *   const handlers = this.openingHoursGuard.wrap({ ...catalog.handlers(), ...cart.handlers(), ... });
 */
@Injectable()
export class OpeningHoursGuard {
  constructor(private readonly deliveryConfigService: DeliveryConfigService) {}

  wrap(
    handlers: Record<string, ToolHandler>,
    guarded: readonly string[] = DEFAULT_OPENING_HOURS_GUARDED_TOOLS,
  ): Record<string, ToolHandler> {
    return withOpeningHoursGuard(
      handlers,
      (cfg, now) => this.deliveryConfigService.isOpen(cfg, now),
      guarded,
    );
  }
}
