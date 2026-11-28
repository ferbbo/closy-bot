import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import type {
  DeliveryOrderLifecycle,
  DeliveryTurnContext,
  LlmToolDef,
  ToolHandler,
  ToolResult,
} from '../../contracts';

/**
 * Token del ciclo de vida del pedido (S4.1). El Integrador lo registra con
 * `{ provide: DELIVERY_ORDER_LIFECYCLE, useExisting: <servicio de S4.1> }`.
 */
export const DELIVERY_ORDER_LIFECYCLE = Symbol('DELIVERY_ORDER_LIFECYCLE');

/** Pedidos "activos" para el cliente (AC-17). */
const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.pending_payment,
  OrderStatus.confirmed,
  OrderStatus.preparing,
  OrderStatus.on_the_way,
];

/** RN-16: el cliente solo puede cancelar en estos estados. */
const CUSTOMER_CANCELLABLE: OrderStatus[] = [OrderStatus.pending_payment, OrderStatus.confirmed];

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** "42" | "ORD-42" | "ORD-0042" | "#42" → número; undefined si no es un código. */
function codeNumber(ref: string): number | undefined {
  const m = /^(?:#|ORD-?)?\s*0*(\d+)$/i.exec(ref.trim());
  return m ? Number(m[1]) : undefined;
}

/** ETA restante = etaMinutes − minutos desde confirmedAt (o createdAt), mínimo 0. */
export function remainingEtaMinutes(
  order: { etaMinutes: number | null; confirmedAt: Date | null; createdAt: Date },
  now: Date,
): number | null {
  if (order.etaMinutes === null || order.etaMinutes === undefined) return null;
  const since = order.confirmedAt ?? order.createdAt;
  const elapsed = Math.floor((now.getTime() - since.getTime()) / 60000);
  return Math.max(0, order.etaMinutes - Math.max(0, elapsed));
}

/**
 * Herramientas de autoservicio del cliente (S4.2): estado_pedido, cancelar_pedido.
 *
 * - Todo se lee de la BD en el turno (RN-00); cifras y ETA calculados aquí, nunca por el LLM.
 * - RN-16: cancelación solo en pending_payment/confirmed, vía `DeliveryOrderLifecycle` (S4.1),
 *   que avisa al encargado. En preparing/on_the_way → CANNOT_CANCEL + ofrecerHumano.
 * - Los handlers nunca lanzan: devuelven ToolResult {ok, data?, error?}.
 */
@Injectable()
export class OrderTools {
  private readonly logger = new Logger(OrderTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'estado_pedido',
      description:
        'Consulta el estado y el tiempo estimado restante del último pedido activo del cliente.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'cancelar_pedido',
      description:
        'Cancela un pedido del cliente. Solo es posible si aún no está en preparación. Sin código usa el último pedido activo.',
      parameters: {
        type: 'object',
        properties: {
          codigo: { type: 'string', description: 'Código del pedido, ej. "ORD-0042" (opcional)' },
          motivo: { type: 'string', description: 'Motivo indicado por el cliente (opcional)' },
        },
        additionalProperties: false,
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DELIVERY_ORDER_LIFECYCLE) private readonly lifecycle: DeliveryOrderLifecycle,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return {
      estado_pedido: (_args, ctx) => this.safe('estado_pedido', () => this.status(ctx)),
      cancelar_pedido: (args, ctx) => this.safe('cancelar_pedido', () => this.cancel(args, ctx)),
    };
  }

  private latestActive(ctx: DeliveryTurnContext) {
    return this.prisma.order.findFirst({
      where: {
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        orderCode: true,
        status: true,
        etaMinutes: true,
        confirmedAt: true,
        createdAt: true,
        totalAmount: true,
      },
    });
  }

  private async status(ctx: DeliveryTurnContext): Promise<ToolResult> {
    const order = await this.latestActive(ctx);
    if (!order) return { ok: true, data: { sinPedidos: true } };
    return {
      ok: true,
      data: {
        codigo: order.orderCode,
        estado: order.status,
        etaRestanteMin: remainingEtaMinutes(order, ctx.now),
        total: Number(order.totalAmount),
      },
    };
  }

  private async cancel(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const ref = asString(args.codigo);
    const reason = asString(args.motivo)?.slice(0, 200) ?? 'Cancelado por el cliente';

    const order = ref ? await this.findOwnOrder(ref, ctx) : await this.latestActive(ctx);
    if (!order) return { ok: false, error: ref ? 'ORDER_NOT_FOUND' : 'NO_ACTIVE_ORDER' };

    if (order.status === OrderStatus.cancelled) {
      return {
        ok: true,
        data: { codigo: order.orderCode, estado: 'cancelled', yaCancelado: true },
      };
    }
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      return {
        ok: false,
        error: 'CANNOT_CANCEL',
        data: { codigo: order.orderCode, estado: order.status, ofrecerHumano: true },
      };
    }

    const result = await this.lifecycle.transition(ctx.merchantId, order.orderCode, 'cancelled', {
      actor: 'customer',
      reason,
    });
    if (!result.ok) {
      // Carrera: el comercio avanzó el pedido entre la lectura y la transición
      return {
        ok: false,
        error: result.reason === 'NOT_FOUND' ? 'ORDER_NOT_FOUND' : 'CANNOT_CANCEL',
        data: {
          codigo: order.orderCode,
          estado: result.status ?? order.status,
          ofrecerHumano: true,
        },
      };
    }
    return { ok: true, data: { codigo: result.orderCode, estado: 'cancelled' } };
  }

  /** Busca un pedido del propio cliente por código (nunca de otro cliente). */
  private async findOwnOrder(ref: string, ctx: DeliveryTurnContext) {
    const n = codeNumber(ref);
    if (n === undefined) return null;
    const candidates = await this.prisma.order.findMany({
      where: { merchantId: ctx.merchantId, customerId: ctx.customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        orderCode: true,
        status: true,
        etaMinutes: true,
        confirmedAt: true,
        createdAt: true,
        totalAmount: true,
      },
    });
    return candidates.find((o) => codeNumber(o.orderCode) === n) ?? null;
  }

  private async safe(name: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Tool ${name} failed: ${(error as Error).message}`);
      return { ok: false, error: 'ORDER_ERROR' };
    }
  }
}
