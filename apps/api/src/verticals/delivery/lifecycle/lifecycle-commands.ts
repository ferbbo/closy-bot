import { Injectable } from '@nestjs/common';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import {
  DELIVERY_TRANSITIONS,
  type DeliveryOrderStatus,
  type TransitionResult,
} from '../contracts';
import { DeliveryOrderLifecycleService } from './delivery-order-lifecycle.service';
import type { DeliveryMerchantCommandHandler } from './merchant-commands.token';

export interface LifecycleCommand {
  to: DeliveryOrderStatus;
  orderRef: string;
  etaMinutes?: number;
  reason?: string;
}

const REF = '#?([a-z]*-?\\d+)';
const LABEL: Record<DeliveryOrderStatus, string> = {
  pending_payment: 'pendiente de pago',
  confirmed: 'confirmado',
  preparing: 'en preparación',
  on_the_way: 'en camino',
  delivered: 'entregado',
  cancelled: 'cancelado',
};
/** Comando que lleva a cada estado, para sugerir el siguiente paso válido. */
const COMMAND_FOR: Partial<Record<DeliveryOrderStatus, string>> = {
  preparing: 'preparando',
  on_the_way: 'salio',
  delivered: 'entregado',
  cancelled: 'cancelar',
};

/** Parser puro (§4.6): `preparando N [min]`, `salio|salió N`, `entregado N`, `cancelar N [motivo]`. */
export function parseLifecycleCommand(text: string): LifecycleCommand | null {
  const raw = text.trim().replace(/\s+/g, ' ');
  const norm = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let m = norm.match(new RegExp(`^preparando ${REF}(?: (\\d{1,3})(?: ?min(?:utos)?)?)?$`));
  if (m) {
    const eta = m[2] ? Number(m[2]) : undefined;
    return { to: 'preparing', orderRef: m[1], ...(eta ? { etaMinutes: eta } : {}) };
  }
  m = norm.match(new RegExp(`^salio ${REF}$`));
  if (m) return { to: 'on_the_way', orderRef: m[1] };
  m = norm.match(new RegExp(`^entregado ${REF}$`));
  if (m) return { to: 'delivered', orderRef: m[1] };
  m = norm.match(new RegExp(`^cancelar ${REF}(?: (.+))?$`));
  if (m) {
    // El motivo conserva el texto original (tildes, mayúsculas).
    const reason = m[2] ? raw.split(' ').slice(2).join(' ') : undefined;
    return { to: 'cancelled', orderRef: m[1], ...(reason ? { reason } : {}) };
  }
  return null;
}

/**
 * LifecycleCommandsService (S4.1-T3, AC-16): comandos de cocina del encargado → lifecycle.
 * Se registra bajo DELIVERY_MERCHANT_COMMANDS; el legacy lo consulta solo si el comando no es legacy.
 */
@Injectable()
export class LifecycleCommandsService implements DeliveryMerchantCommandHandler {
  constructor(
    private readonly lifecycle: DeliveryOrderLifecycleService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async tryHandle(merchantId: string, text: string): Promise<string | null> {
    if (!this.featureFlags.isDeliveryEnabled) return null;
    const cmd = parseLifecycleCommand(text);
    if (!cmd) return null;
    const result = await this.lifecycle.transition(merchantId, cmd.orderRef, cmd.to, {
      actor: 'merchant',
      etaMinutes: cmd.etaMinutes,
      reason: cmd.reason,
    });
    return this.reply(cmd, result);
  }

  private reply(cmd: LifecycleCommand, r: TransitionResult): string {
    if (!r.ok) {
      if (r.reason === 'NOT_FOUND') {
        return `❌ No encontré el pedido ${cmd.orderRef.toUpperCase()}. Escribe 'pendientes' para ver los pedidos activos.`;
      }
      const status = r.status ?? 'pending_payment';
      const next = DELIVERY_TRANSITIONS[status]
        .filter((s) => COMMAND_FOR[s])
        .map((s) => `'${COMMAND_FOR[s]} ${r.orderCode}'`);
      const hint = next.length ? ` Puedes usar: ${next.join(' o ')}.` : ' Ya no admite cambios.';
      return `❌ El pedido ${r.orderCode} está ${LABEL[status]}; no puede pasar a ${LABEL[cmd.to]}.${hint}`;
    }
    if ('idempotent' in r) return `ℹ️ El pedido ${r.orderCode} ya estaba ${LABEL[r.status]}.`;
    const eta = cmd.to === 'preparing' && cmd.etaMinutes ? ` (≈${cmd.etaMinutes} min)` : '';
    const notice = r.notified ? ' Cliente notificado.' : ' No se pudo notificar al cliente.';
    return `✅ Pedido ${r.orderCode} ${LABEL[r.to]}${eta}.${notice}`;
  }
}
