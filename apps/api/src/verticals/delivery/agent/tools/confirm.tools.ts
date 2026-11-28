import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { maskPhone } from '../../../../common/utils/pii.util';
import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { CartService } from '../../../../services/cart.service';
import { CheckoutService } from '../../../../services/checkout.service';
import {
  SHIPPING_QUOTE_PROVIDER,
  type CheckoutDraft,
  type DeliveryTurnContext,
  type KitchenTicket,
  type LlmToolDef,
  type ShippingQuoteProvider,
  type ToolHandler,
  type ToolResult,
} from '../../contracts';
import { CheckoutDraftStore } from '../../checkout/checkout-draft.store';
import { BusinessMessengerService } from '../../messaging/business-messenger.service';
import { CartPresenter, formatCop } from '../../presenters/cart.presenter';
import { OrderSummaryInput, OrderSummaryPresenter } from '../../presenters/order-summary.presenter';
import { OrderSinkRunner } from '../../sinks/whatsapp-kitchen.sink';
import { AmountLimitGuard } from '../../handler/guards/amount-limit.guard';

export const SUMMARY_TTL_MS = 15 * 60 * 1000;
const AFFIRMATIVE_RE =
  /(?<!\p{L})(s[ií]|dale|listo|conf[ií]rm(?:a|alo|o|ado)|de una|h[aá]gale|h[aá]gamosle|ok|okay|va|claro|perfecto|correcto|eso es)(?!\p{L})/iu;
const NEGATIVE_RE = /(?<!\p{L})(no|espera|cambia|todav[ií]a no|mejor no)(?!\p{L})/iu;

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE_RE.test(text) && !NEGATIVE_RE.test(text);
}

/**
 * Herramientas de confirmación (S3.3-T1, RN-12, AC-14):
 * - `resumen_pedido`: re-cotiza con la BD, renderiza el bloque EXACTO y emite un token ligado al hash.
 * - `confirmar_pedido`: exige resumen de un turno anterior, token vigente (15 min), mismo hash y
 *   mensaje afirmativo; solo entonces nace el Order (createOrder con extras), se confirma (COD),
 *   se notifica al cliente por plantilla y se publica la comanda en los ORDER_SINKS.
 */
@Injectable()
export class ConfirmTools {
  private readonly logger = new Logger(ConfirmTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'resumen_pedido',
      description:
        'Genera el resumen final (bloque exacto con total) y un confirmationToken. Úsalo cuando ya hay carrito, entrega cotizada y pago. Muestra el bloque tal cual y pregunta si lo confirma.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'confirmar_pedido',
      description:
        'Confirma el pedido SOLO si el cliente respondió afirmativamente al resumen de un mensaje anterior. Requiere el confirmationToken de resumen_pedido.',
      parameters: {
        type: 'object',
        properties: { confirmationToken: { type: 'string' } },
        required: ['confirmationToken'],
        additionalProperties: false,
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
    private readonly cartPresenter: CartPresenter,
    private readonly summaryPresenter: OrderSummaryPresenter,
    private readonly drafts: CheckoutDraftStore,
    @Inject(SHIPPING_QUOTE_PROVIDER) private readonly quotes: ShippingQuoteProvider,
    private readonly messenger: BusinessMessengerService,
    private readonly sinks: OrderSinkRunner,
    private readonly amountLimit: AmountLimitGuard,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return {
      resumen_pedido: (_a, ctx) => this.safe(() => this.summary(ctx)),
      confirmar_pedido: (args, ctx) => this.safe(() => this.confirm(args, ctx)),
    };
  }

  private async buildInput(
    ctx: DeliveryTurnContext,
  ): Promise<{ input: OrderSummaryInput; draft: CheckoutDraft } | ToolResult> {
    const cart = await this.cartService.createOrGetActiveCart(ctx.customerId, ctx.merchantId);
    const view = this.cartPresenter.toView(cart);
    if (view.lines.length === 0) return { ok: false, error: 'CART_EMPTY' };
    const draft =
      (await this.drafts.get(ctx.conversationId)) ?? ({ cartId: view.cartId } as CheckoutDraft);
    const fulfillment = draft.fulfillment ?? 'delivery';
    if (!draft.paymentMethod) return { ok: false, error: 'NEEDS_PAYMENT' };
    // RN-00: re-quote with the live subtotal (no cached figures)
    const quote = await this.quotes.quote({
      merchantId: ctx.merchantId,
      address: draft.address,
      neighborhood: draft.neighborhood,
      subtotal: view.subtotal,
      fulfillment,
    });
    if (!quote.ok)
      return {
        ok: true,
        data: {
          status: quote.reason,
          minimo: quote.minOrder ?? null,
          faltante: quote.missing ?? null,
        },
      };
    if (
      draft.paymentMethod === 'cod' &&
      draft.cashChangeFor &&
      draft.cashChangeFor < view.subtotal + quote.fee
    ) {
      return { ok: false, error: 'CASH_BELOW_TOTAL' };
    }
    return {
      draft: { ...draft, cartId: view.cartId, fulfillment, quote },
      input: {
        cart: view,
        fulfillment,
        address: draft.address ?? null,
        neighborhood: draft.neighborhood ?? null,
        zoneName: quote.zoneName,
        fee: quote.fee,
        etaMinutes: quote.etaMinutes,
        paymentMethod: draft.paymentMethod,
        cashChangeFor: draft.cashChangeFor ?? null,
      },
    };
  }

  private async summary(ctx: DeliveryTurnContext): Promise<ToolResult> {
    const built = await this.buildInput(ctx);
    if (!('input' in built)) return built;
    const view = this.summaryPresenter.present(built.input);
    await this.drafts.patch(ctx.conversationId, {
      cartId: built.draft.cartId,
      quote: built.draft.quote,
      summary: {
        hash: view.hash,
        token: view.confirmationToken,
        issuedAt: ctx.now.toISOString(),
        shownInMessageId: ctx.now.toISOString(),
      },
    });
    return {
      ok: true,
      data: { text: view.block, total: view.total, confirmationToken: view.confirmationToken },
    };
  }

  private async confirm(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const draft = await this.drafts.get(ctx.conversationId);
    const s = draft?.summary;
    if (!s) return { ok: false, error: 'NEEDS_SUMMARY' };
    if (typeof args.confirmationToken !== 'string' || args.confirmationToken !== s.token)
      return { ok: false, error: 'INVALID_TOKEN' };
    const issued = new Date(s.issuedAt).getTime();
    if (issued >= ctx.now.getTime()) return { ok: false, error: 'SUMMARY_SAME_TURN' };
    if (ctx.now.getTime() - issued > SUMMARY_TTL_MS) return { ok: false, error: 'SUMMARY_EXPIRED' };
    if (!isAffirmative(ctx.text)) return { ok: false, error: 'NOT_AFFIRMATIVE' };

    const built = await this.buildInput(ctx);
    if (!('input' in built)) return built;
    if (this.summaryPresenter.hash(built.input) !== s.hash) {
      await this.drafts.patch(ctx.conversationId, { summary: undefined });
      return { ok: false, error: 'SUMMARY_CHANGED' };
    }

    const { input } = built;
    const customer = await this.prisma.customer.findUnique({
      where: { id: ctx.customerId },
      select: { name: true },
    });
    const order = await this.checkoutService.createOrder(
      {
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
        cartId: input.cart.cartId,
        customerName: customer?.name ?? 'Cliente',
        customerPhone: ctx.customerPhone,
        shippingAddress:
          input.fulfillment === 'pickup' ? 'Recoge en el local' : (input.address ?? '-'),
        paymentMethod: input.paymentMethod,
      },
      {
        deliveryZone: input.zoneName,
        etaMinutes: input.etaMinutes,
        shippingCost: input.fee,
        fulfillment: input.fulfillment,
        cashChangeFor: input.cashChangeFor,
        neighborhood: input.neighborhood,
        reference: built.draft.reference ?? null,
      },
    );
    const total = input.cart.subtotal + input.fee;
    const needsHuman = this.amountLimit.exceeds(total, ctx.config);
    const confirmed = input.paymentMethod === 'cod' && !needsHuman; // RN-13 / RN-17
    if (confirmed) {
      await this.prisma.order.update({
        where: { id: order.orderId },
        data: { status: OrderStatus.confirmed, confirmedAt: ctx.now },
      });
    }
    await this.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { optedOutAt: null },
    });
    await this.drafts.patch(ctx.conversationId, { summary: undefined, quote: undefined });

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: ctx.merchantId },
      select: { name: true },
    });
    const common = {
      order_code: order.orderCode,
      merchant_name: merchant?.name ?? '',
      total: formatCop(total),
    };
    let revision: string | null = null;
    if (needsHuman) {
      revision = (await this.amountLimit.escalate(ctx, input.cart.cartId)).response;
    } else if (confirmed) {
      await this.messenger.notify({
        merchantId: ctx.merchantId,
        to: ctx.customerPhone,
        conversationId: ctx.conversationId,
        orderId: order.orderId,
        template: 'pedido_confirmado',
        params: {
          ...common,
          customer_name: customer?.name ?? 'cliente',
          eta_minutes: String(input.etaMinutes ?? ''),
        },
        dedupeKey: `order:${order.orderId}:status:confirmed`,
      });
      await this.sinks.publish(
        ctx.merchantId,
        this.ticket(order, input, total, customer?.name ?? 'Cliente', ctx),
      );
    } else {
      await this.messenger.notify({
        merchantId: ctx.merchantId,
        to: ctx.customerPhone,
        conversationId: ctx.conversationId,
        orderId: order.orderId,
        template: 'pago_pendiente',
        params: common,
        dedupeKey: `order:${order.orderId}:status:pending_payment`,
      });
    }
    return {
      ok: true,
      data: {
        orderCode: order.orderCode,
        estado: confirmed ? 'confirmed' : 'pending_payment',
        total,
        revisionHumana: needsHuman,
        mensajeRevision: revision,
      },
    };
  }

  private ticket(
    order: { orderId: string; orderCode: string },
    input: OrderSummaryInput,
    total: number,
    customerName: string,
    ctx: DeliveryTurnContext,
  ): KitchenTicket {
    return {
      orderId: order.orderId,
      orderCode: order.orderCode,
      createdAt: ctx.now,
      lines: input.cart.lines.map((l) => ({
        quantity: l.quantity,
        label: l.label,
        notes: l.notes,
      })),
      fulfillment: input.fulfillment,
      address: input.address,
      neighborhood: input.neighborhood,
      paymentMethod: input.paymentMethod,
      cashChangeFor: input.cashChangeFor,
      total,
      etaMinutes: input.etaMinutes,
      customerName,
      customerPhoneMasked: maskPhone(ctx.customerPhone),
    };
  }

  private async safe(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`confirm tool failed: ${(error as Error).message}`);
      return { ok: false, error: 'CONFIRM_ERROR' };
    }
  }
}
