import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import {
  DELIVERY_TRANSITIONS,
  type DeliveryOrderLifecycle,
  type DeliveryOrderStatus,
  type TransitionResult,
} from '../contracts';
import { CustomerStatusNotifierService } from './customer-status-notifier.service';

/**
 * Estados legacy fuera de DeliveryOrderStatus: `paid` (comando PAGADO) equivale a `confirmed`
 * y `shipped` (comando legacy `enviado`) equivale a `on_the_way`.
 */
export function toDeliveryStatus(status: OrderStatus | string): DeliveryOrderStatus {
  if (status === 'paid') return 'confirmed';
  if (status === 'shipped') return 'on_the_way';
  return status as DeliveryOrderStatus;
}

/** Número del pedido en "42" | "ORD-42" | "ORD-0042" | "#42" → 42; null si no hay número. */
export function parseOrderNumber(ref: string): number | null {
  const m = ref.trim().match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

type FoundOrder = { id: string; orderCode: string; status: OrderStatus };

/**
 * DeliveryOrderLifecycleService (S4.1-T1, RN-14, RN-15, AC-16).
 * Única puerta de cambios de estado de cocina; valida con DELIVERY_TRANSITIONS, es idempotente
 * para el mismo estado (sin notificar) y notifica al cliente una vez por transición.
 */
@Injectable()
export class DeliveryOrderLifecycleService implements DeliveryOrderLifecycle {
  private readonly logger = new Logger(DeliveryOrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: CustomerStatusNotifierService,
  ) {}

  async transition(
    merchantId: string,
    orderRef: string,
    to: DeliveryOrderStatus,
    opts: { etaMinutes?: number; reason?: string; actor: 'merchant' | 'customer' | 'system' } = {
      actor: 'system',
    },
  ): Promise<TransitionResult> {
    const order = await this.findOrder(merchantId, orderRef);
    if (!order) return { ok: false, reason: 'NOT_FOUND' };

    const from = toDeliveryStatus(order.status);
    if (from === to) {
      if (to === 'preparing' && opts.etaMinutes != null) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { etaMinutes: opts.etaMinutes },
        });
      }
      return { ok: true, idempotent: true, orderCode: order.orderCode, status: from };
    }
    if (!(DELIVERY_TRANSITIONS[from] ?? []).includes(to)) {
      return { ok: false, reason: 'INVALID_TRANSITION', orderCode: order.orderCode, status: from };
    }

    const data: Prisma.OrderUpdateManyMutationInput = { status: to as OrderStatus };
    if (to === 'cancelled') data.cancelledAt = new Date();
    if (to === 'confirmed') data.confirmedAt = new Date();
    if (opts.etaMinutes != null) data.etaMinutes = opts.etaMinutes;

    // Compare-and-set sobre el estado leído: evita doble transición concurrente.
    const updated = await this.prisma.order.updateMany({
      where: { id: order.id, merchantId, status: order.status },
      data,
    });
    if (updated.count === 0) {
      const current = await this.prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      const status = toDeliveryStatus(current?.status ?? order.status);
      if (status === to) return { ok: true, idempotent: true, orderCode: order.orderCode, status };
      return { ok: false, reason: 'INVALID_TRANSITION', orderCode: order.orderCode, status };
    }

    this.logger.log(`Order ${order.orderCode}: ${from} → ${to} (actor=${opts.actor})`);
    const notified = await this.notifier.notify(order.id, to, { reason: opts.reason });
    return { ok: true, orderId: order.id, orderCode: order.orderCode, from, to, notified };
  }

  private async findOrder(merchantId: string, orderRef: string): Promise<FoundOrder | null> {
    const ref = orderRef.trim().replace(/^#/, '');
    if (!ref) return null;
    const select = { id: true, orderCode: true, status: true } as const;

    const exact = await this.prisma.order.findFirst({
      where: { merchantId, orderCode: { equals: ref, mode: 'insensitive' } },
      select,
    });
    if (exact) return exact;

    const n = parseOrderNumber(ref);
    if (n == null) return null;
    const candidates = await this.prisma.order.findMany({
      where: { merchantId, orderCode: { endsWith: String(n) } },
      select,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return candidates.find((c) => parseOrderNumber(c.orderCode) === n) ?? null;
  }
}
