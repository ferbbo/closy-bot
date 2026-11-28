import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { ORDER_SINKS, type KitchenTicket, type OrderSink } from '../contracts';
import { BusinessMessengerService } from '../messaging/business-messenger.service';
import { formatCop } from '../presenters/cart.presenter';
import { KitchenTicketPresenter } from '../presenters/kitchen-ticket.presenter';

/**
 * WhatsAppKitchenSink (S3.3-T2, AC-15/AC-37): la comanda sale al encargado SIEMPRE por
 * BusinessMessenger (RN-15): plantilla `comanda_nuevo_pedido` con los ítems en una línea, o
 * el texto completo del ticket si la ventana del encargado está abierta y mode=auto.
 * Idempotente por `dedupeKey order:{id}:kitchen`.
 */
@Injectable()
export class WhatsAppKitchenSink implements OrderSink {
  readonly name = 'whatsapp_kitchen';
  private readonly logger = new Logger(WhatsAppKitchenSink.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: BusinessMessengerService,
    private readonly presenter: KitchenTicketPresenter,
  ) {}

  async publish(merchantId: string, ticket: KitchenTicket): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { whatsappNumber: true },
    });
    if (!merchant?.whatsappNumber) {
      this.logger.warn(`Merchant ${merchantId} has no whatsappNumber: kitchen ticket not sent`);
      return;
    }
    const result = await this.messenger.notify({
      merchantId,
      to: merchant.whatsappNumber,
      orderId: ticket.orderId,
      template: 'comanda_nuevo_pedido',
      params: {
        order_code: ticket.orderCode,
        items: this.presenter.itemsOneLine(ticket),
        fulfillment: ticket.fulfillment === 'pickup' ? 'Recoge en el local' : 'Domicilio',
        address:
          ticket.fulfillment === 'pickup'
            ? '-'
            : `${ticket.address ?? '-'}${ticket.neighborhood ? `, ${ticket.neighborhood}` : ''}`,
        payment:
          ticket.paymentMethod === 'cod'
            ? `Efectivo${ticket.cashChangeFor ? ` (cambio de ${formatCop(ticket.cashChangeFor)})` : ''}`
            : 'Transferencia',
        total: formatCop(ticket.total),
      },
      dedupeKey: `order:${ticket.orderId}:kitchen`,
      freeText: this.presenter.render(ticket),
    });
    this.logger.log(`Kitchen ticket ${ticket.orderCode}: ${result.status}`);
  }
}

/**
 * Publica el ticket en todos los ORDER_SINKS en orden ([WhatsAppKitchenSink, PosOrderSink]).
 * El error de un sink nunca detiene al siguiente ni rompe la confirmación (RN-23).
 */
@Injectable()
export class OrderSinkRunner {
  private readonly logger = new Logger(OrderSinkRunner.name);

  constructor(@Optional() @Inject(ORDER_SINKS) private readonly sinks: OrderSink[] = []) {}

  async publish(
    merchantId: string,
    ticket: KitchenTicket,
  ): Promise<Array<{ sink: string; ok: boolean }>> {
    const results: Array<{ sink: string; ok: boolean }> = [];
    for (const sink of this.sinks ?? []) {
      try {
        await sink.publish(merchantId, ticket);
        results.push({ sink: sink.name, ok: true });
      } catch (error) {
        this.logger.error(
          `Order sink ${sink.name} failed for ${ticket.orderCode}: ${(error as Error).message}`,
        );
        results.push({ sink: sink.name, ok: false });
      }
    }
    return results;
  }
}
