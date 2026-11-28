import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { BusinessMessengerService } from '../messaging/business-messenger.service';
import type { ImageKind, VerticalContext } from '../contracts';

export const RECEIPT_TEXTS = {
  received: 'Recibimos tu comprobante, el local lo valida 🙌',
  whichOrder: '¿De qué pedido es este comprobante?',
} as const;

/** RN-26: el caption menciona pago o comprobante. */
const RECEIPT_CAPTION_RE =
  /(?<!\p{L})(pago|pagu[eé]|pagado|comprobante|transferencia|transfer[ií]|consignaci[oó]n|consign[eé]|recibo|soporte de pago)(?!\p{L})/iu;

export function captionMentionsPayment(caption?: string | null): boolean {
  return !!caption && RECEIPT_CAPTION_RE.test(caption);
}

/**
 * ReceiptForwarder (S5.3-T3, F-17, RN-26, AC-27): una imagen de comprobante con un pedido
 * `pending_payment` del cliente se avisa al encargado con el código del pedido vía
 * `BusinessMessenger.alertOperation` (plantilla `alerta_operacion`, una por imagen:
 * dedupeKey `order:{id}:receipt:{wamid}`). No hay envío de imagen saliente en v1 (SEND_IMAGE es
 * S5.4), así que el aviso indica revisar el comprobante en el chat del cliente.
 * El bot NUNCA cambia el estado del pedido: el encargado confirma con `PAGADO <código>`.
 * No loguea caption ni teléfono.
 */
@Injectable()
export class ReceiptForwarder {
  private readonly logger = new Logger(ReceiptForwarder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: BusinessMessengerService,
  ) {}

  /** Respuesta para el cliente si la imagen es un comprobante; null si sigue el flujo normal. */
  async handle(ctx: VerticalContext, kind: ImageKind | null): Promise<string | null> {
    const byVision = kind === 'payment_receipt';
    if (!byVision && !captionMentionsPayment(ctx.input.caption)) return null;

    const order = await this.prisma.order.findFirst({
      where: {
        merchantId: ctx.merchant.id,
        customerId: ctx.customer.id,
        status: OrderStatus.pending_payment,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderCode: true },
    });
    if (!order) {
      // Caption de pago sin pedido pendiente y la visión no ve un comprobante → flujo normal.
      return byVision ? RECEIPT_TEXTS.whichOrder : null;
    }

    const result = await this.messenger.alertOperation({
      merchantId: ctx.merchant.id,
      alert: `el cliente envió un comprobante de pago por el chat; revísalo y si está bien responde PAGADO ${order.orderCode}`,
      orderCode: order.orderCode,
      dedupeKey: `order:${order.id}:receipt:${ctx.input.messageId}`,
    });
    this.logger.log(
      JSON.stringify({
        event: 'delivery.receipt_forwarded',
        merchantId: ctx.merchant.id,
        orderId: order.id,
        status: result?.status ?? 'not_sent',
      }),
    );
    return RECEIPT_TEXTS.received;
  }
}
