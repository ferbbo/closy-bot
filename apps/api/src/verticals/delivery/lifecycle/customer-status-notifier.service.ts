import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { BusinessMessengerService } from '../messaging/business-messenger.service';
import { formatCop } from '../presenters/cart.presenter';
import type { DeliveryOrderStatus, TemplateName } from '../contracts';

/** Plantilla utility por estado (SPEC §4.6a). `pending_payment` no notifica desde el ciclo de vida. */
export const STATUS_TEMPLATES: Partial<Record<DeliveryOrderStatus, TemplateName>> = {
  confirmed: 'pedido_confirmado',
  preparing: 'pedido_en_preparacion',
  on_the_way: 'pedido_en_camino',
  delivered: 'pedido_entregado',
  cancelled: 'pedido_cancelado',
};

export function statusDedupeKey(orderId: string, status: DeliveryOrderStatus): string {
  return `order:${orderId}:status:${status}`;
}

/**
 * CustomerStatusNotifier (S4.1-T2, RN-15, AC-34).
 * Por cada transición encola UNA notificación al cliente vía BusinessMessenger (plantilla de
 * §4.6a, dedupeKey `order:{id}:status:{s}`). Los parámetros salen de la BD (RN-00).
 * Nunca lanza: devuelve `true` si se encoló (template o texto), `false` si se omitió o falló.
 */
@Injectable()
export class CustomerStatusNotifierService {
  private readonly logger = new Logger(CustomerStatusNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: BusinessMessengerService,
  ) {}

  async notify(
    orderId: string,
    status: DeliveryOrderStatus,
    opts: { reason?: string } = {},
  ): Promise<boolean> {
    const template = STATUS_TEMPLATES[status];
    if (!template) return false;
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          merchantId: true,
          orderCode: true,
          customerName: true,
          customerPhone: true,
          totalAmount: true,
          etaMinutes: true,
          merchant: { select: { name: true } },
        },
      });
      if (!order) {
        this.logger.warn(`notify: order ${orderId} not found`);
        return false;
      }
      const base = { order_code: order.orderCode, merchant_name: order.merchant.name };
      const eta = order.etaMinutes != null ? String(order.etaMinutes) : '-';
      let params: Record<string, string>;
      let freeText: string;
      switch (status) {
        case 'confirmed':
          params = {
            ...base,
            customer_name: order.customerName,
            total: formatCop(Number(order.totalAmount)),
            eta_minutes: eta,
          };
          freeText = `Tu pedido ${order.orderCode} quedó confirmado. Total: ${params.total}. Tiempo estimado: ${eta} minutos.`;
          break;
        case 'preparing':
          params = { ...base, eta_minutes: eta };
          freeText = `Tu pedido ${order.orderCode} ya está en preparación. Llega en unos ${eta} minutos.`;
          break;
        case 'on_the_way':
          params = base;
          freeText = `Tu pedido ${order.orderCode} va en camino.`;
          break;
        case 'delivered':
          params = base;
          freeText = `Tu pedido ${order.orderCode} fue entregado. Si hay algún problema, responde a este mensaje.`;
          break;
        default: {
          const reason = (opts.reason ?? '').replace(/\s+/g, ' ').trim() || 'sin motivo informado';
          params = { ...base, reason };
          freeText = `Tu pedido ${order.orderCode} fue cancelado. Motivo: ${reason}. Si ya pagaste, responde a este mensaje para gestionar la devolución.`;
        }
      }
      const result = await this.messenger.notify({
        merchantId: order.merchantId,
        to: order.customerPhone,
        orderId: order.id,
        template,
        params,
        dedupeKey: statusDedupeKey(order.id, status),
        freeText,
      });
      if (result.status !== 'queued') {
        this.logger.log(`notify ${template} skipped for ${order.orderCode}: ${result.reason}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `notify ${template} failed for order ${orderId}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
