import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import type {
  KitchenTicket,
  OrderSink,
  PosAdapter,
  PosContext,
  PosIntegrationConfig,
  PosResult,
} from '../contracts';
import { DeliveryConfigService } from '../config/delivery-config.service';
import { BusinessMessengerService } from '../messaging/business-messenger.service';
import { NOOP_POS_PROVIDER } from '../pos/adapters/noop.pos-adapter';
import { PosAdapterRegistryService } from '../pos/pos-adapter.registry';

export type PosSyncStatus = 'skipped' | 'synced' | 'failed';

type PushResult = PosResult<{ externalId: string }>;

/**
 * PosOrderSink (S3.4-T3, RN-23 / AC-30). Único punto que habla con un `PosAdapter`.
 * Va en `ORDER_SINKS` después del sink de cocina y **nunca lanza** (no bloquea la comanda).
 *
 * - provider 'none' / deshabilitado / desconocido (Noop sin capability pushOrder) →
 *   `posSyncStatus='skipped'` sin llamar al adapter.
 * - ok → `synced` + `posExternalId`. Error `retryable` → 1 reintento inmediato.
 * - fallo → `failed`, warning en log (sin secretos) y `alerta_operacion` al encargado con
 *   `dedupeKey order:{orderId}:pos_failed`.
 * - Idempotente por orderId: si la orden ya está `synced` no repite.
 */
@Injectable()
export class PosOrderSink implements OrderSink {
  readonly name = 'pos';
  private readonly logger = new Logger(PosOrderSink.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryConfig: DeliveryConfigService,
    private readonly registry: PosAdapterRegistryService,
    private readonly messenger: BusinessMessengerService,
  ) {}

  async publish(merchantId: string, ticket: KitchenTicket): Promise<void> {
    try {
      await this.sync(merchantId, ticket);
    } catch (error) {
      this.logger.error(`pos sink error order=${ticket.orderId}: ${(error as Error).message}`);
    }
  }

  private async sync(merchantId: string, ticket: KitchenTicket): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: ticket.orderId, merchantId },
      select: { id: true, posSyncStatus: true },
    });
    if (!order) {
      this.logger.warn(`pos sink: order not found order=${ticket.orderId}`);
      return;
    }
    if (order.posSyncStatus === 'synced') return;

    const config = (await this.deliveryConfig.get(merchantId)).pos;
    const adapter = this.registry.resolve(config);
    if (adapter.provider === NOOP_POS_PROVIDER || !adapter.capabilities().pushOrder) {
      await this.persist(order.id, NOOP_POS_PROVIDER, 'skipped');
      return;
    }

    const ctx = this.buildContext(merchantId, config);
    let result = await this.safePush(adapter, ticket, ctx);
    if (!result.ok && result.retryable) {
      result = await this.safePush(adapter, ticket, ctx);
    }

    if (result.ok) {
      await this.persist(order.id, adapter.provider, 'synced', result.value.externalId);
      return;
    }

    await this.persist(order.id, adapter.provider, 'failed');
    const error = redact(result.error, config, ctx);
    this.logger.warn(
      `pos push failed provider=${adapter.provider} order=${order.id} retryable=${result.retryable} error=${error}`,
    );
    await this.messenger.alertOperation({
      merchantId,
      orderId: order.id,
      orderCode: ticket.orderCode,
      alert: `el pedido no se pudo registrar en el POS (${adapter.provider}); la comanda por WhatsApp sí salió`,
      dedupeKey: `order:${order.id}:pos_failed`,
    });
  }

  private buildContext(merchantId: string, config: PosIntegrationConfig): PosContext {
    return {
      merchantId,
      config,
      resolveSecret: () => (config.secretRef ? (process.env[config.secretRef] ?? null) : null),
    };
  }

  private async safePush(
    adapter: PosAdapter,
    ticket: KitchenTicket,
    ctx: PosContext,
  ): Promise<PushResult> {
    try {
      return await adapter.pushOrder(ticket, ctx);
    } catch (error) {
      // Un adapter que lanza viola el contrato: se trata como fallo no reintentable.
      return { ok: false, retryable: false, error: `adapter threw: ${(error as Error).message}` };
    }
  }

  private async persist(
    orderId: string,
    provider: string,
    status: PosSyncStatus,
    externalId?: string,
  ): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        posProvider: provider,
        posSyncStatus: status,
        ...(externalId !== undefined ? { posExternalId: externalId } : {}),
      },
    });
  }
}

/** Quita del mensaje de error el secretRef y el valor del secreto si un adapter los filtró. */
function redact(message: string, config: PosIntegrationConfig, ctx: PosContext): string {
  let out = message;
  const secret = config.secretRef ? ctx.resolveSecret() : null;
  if (secret) out = out.split(secret).join('***');
  if (config.secretRef) out = out.split(config.secretRef).join('***');
  return out.replace(/\s+/g, ' ').slice(0, 300);
}
