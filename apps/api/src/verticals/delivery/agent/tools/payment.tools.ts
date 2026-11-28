import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { CartRepository } from '../../../../persistence/repositories/cart.repository';
import { CartPresenter } from '../../presenters/cart.presenter';
import type {
  CheckoutDraft,
  DeliveryTurnContext,
  LlmToolDef,
  ToolHandler,
  ToolResult,
} from '../../contracts';

type DeliveryPaymentMethod = NonNullable<CheckoutDraft['paymentMethod']>;
const DELIVERY_METHODS: readonly DeliveryPaymentMethod[] = ['cod', 'transfer'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Montos de efectivo menores que este valor se interpretan como miles ("con 50" → 50.000). */
const THOUSANDS_THRESHOLD = 1000;

function normalizeCash(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const amount = Math.round(value < THOUSANDS_THRESHOLD ? value * 1000 : value);
  return amount > 0 ? amount : null;
}

/**
 * Parser del "¿con cuánto pagas?" (AC-13): "50 mil", "50.000", "50k", "con 50", "$100.000",
 * "50 lucas" → COP enteros. Un valor < 1000 sin sufijo se interpreta como miles. `null` si no
 * hay un monto reconocible. Acepta también un número (argumento numérico del LLM).
 */
export function parseCashAmount(input: unknown): number | null {
  if (typeof input === 'number') return normalizeCash(input);
  if (typeof input !== 'string') return null;
  const text = input.toLowerCase();
  const m = /(\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)\s*(mil|k|lucas?)?(?![a-z])/.exec(text);
  if (!m) return null;
  const [, digits, suffix] = m;
  const value = /^\d{1,3}(?:[.,]\d{3})+$/.test(digits)
    ? Number(digits.replace(/[.,]/g, ''))
    : Number(digits.replace(',', '.'));
  if (suffix) return value > 0 ? Math.round(value * 1000) : null;
  return normalizeCash(value);
}

/**
 * Instrucciones de pago LITERALES de `MerchantConfig.paymentMethods` (RN-00), mismo criterio que
 * `consultar_negocio` (business-info.tool.ts): `instructions` → `bankInfo` unido con " · " →
 * `paymentLinkUrl`. Duplicado mínimo: ese helper no se exporta y el archivo no es de este track.
 */
function paymentInstructions(pm: Record<string, unknown>): string | null {
  const direct = str(pm.instructions);
  if (direct) return direct;
  const bank = asRecord(pm.bankInfo);
  if (bank) {
    const parts = ['bankName', 'accountType', 'accountNumber', 'accountHolder']
      .map((k) => str(bank[k]))
      .filter((v): v is string => v !== null);
    if (parts.length > 0) return parts.join(' · ');
  }
  return str(pm.paymentLinkUrl);
}

/**
 * Herramienta `fijar_pago({metodo, pagaCon?})` (S3.2-T2, AC-13, RN-13).
 *
 * - Valida el método contra `MerchantConfig.paymentMethods` leído en el turno (RN-00).
 * - Efectivo: `pagaCon` ≥ total (subtotal del carrito en BD + `draft.quote.fee`; pickup = subtotal). Sin `pagaCon`
 *   se persiste el método y se pide el monto (`pedirMontoEfectivo`).
 * - Transferencia: devuelve las instrucciones literales de la BD como dato.
 * - Persiste `paymentMethod` y `cashChangeFor` en `Conversation.metadata.delivery.checkout`.
 * - Nunca lanza: devuelve ToolResult {ok, data?, error?}.
 */
@Injectable()
export class PaymentTools {
  private readonly logger = new Logger(PaymentTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'fijar_pago',
      description:
        'Fija el medio de pago del pedido: "cod" (efectivo contra entrega) o "transfer" (transferencia). En efectivo, pagaCon es el billete con el que paga el cliente, tal como lo dijo (ej. "50 mil").',
      parameters: {
        type: 'object',
        properties: {
          metodo: { type: 'string', enum: [...DELIVERY_METHODS] },
          pagaCon: {
            type: ['string', 'number'],
            description: 'Solo efectivo: con cuánto paga, texto literal del cliente o número',
          },
        },
        required: ['metodo'],
        additionalProperties: false,
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartRepository: CartRepository,
    private readonly presenter: CartPresenter,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return { fijar_pago: (args, ctx) => this.safe(() => this.fijarPago(args, ctx)) };
  }

  private async fijarPago(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const metodo = args.metodo as DeliveryPaymentMethod;
    if (!DELIVERY_METHODS.includes(metodo)) return { ok: false, error: 'INVALID_ARGS' };

    const available = await this.availableMethods(ctx.merchantId);
    const chosen = available.find((pm) => pm.type === metodo);
    if (!chosen) {
      return {
        ok: false,
        error: 'METHOD_NOT_AVAILABLE',
        data: { disponibles: available.map(({ type, label }) => ({ type, label })) },
      };
    }

    const active = await this.cartRepository.findActiveCart(ctx.customerId, ctx.merchantId);
    const cart = active ? await this.cartRepository.findByIdWithItems(active.id) : null;
    if (!cart || cart.items.length === 0) return { ok: false, error: 'EMPTY_CART' };
    const subtotal = this.presenter.toView(cart).subtotal;

    const draft = await this.readDraft(ctx.conversationId);
    const total = this.computeTotal(subtotal, draft);

    let cashChangeFor: number | null = null;
    const hasPagaCon = args.pagaCon !== undefined && args.pagaCon !== null && args.pagaCon !== '';
    if (metodo === 'cod' && hasPagaCon) {
      const amount = parseCashAmount(args.pagaCon);
      if (amount === null) return { ok: false, error: 'INVALID_CASH_AMOUNT' };
      if (total === null) return { ok: false, error: 'NEEDS_QUOTE' };
      if (amount < total) {
        return { ok: false, error: 'CASH_BELOW_TOTAL', data: { total, pagaCon: amount } };
      }
      cashChangeFor = amount;
    }

    await this.writeDraft(ctx.conversationId, {
      ...draft,
      cartId: draft?.cartId ?? cart.id,
      paymentMethod: metodo,
      cashChangeFor,
    });

    const data: Record<string, unknown> = { metodo, label: chosen.label, total };
    if (metodo === 'transfer') data.instrucciones = chosen.instructions;
    if (metodo === 'cod') {
      data.pagaCon = cashChangeFor;
      if (cashChangeFor !== null && total !== null) data.cambio = cashChangeFor - total;
      else data.pedirMontoEfectivo = true;
    }
    return { ok: true, data };
  }

  /**
   * Total = subtotal + tarifa cotizada (RN-10). Pickup → tarifa 0 (total = subtotal), aunque
   * quede una cotización de domicilio anterior en el draft. `null` si es domicilio sin cotización.
   */
  private computeTotal(subtotal: number, draft: CheckoutDraft | null): number | null {
    if (draft?.fulfillment === 'pickup') return subtotal;
    if (draft?.quote) return subtotal + draft.quote.fee;
    return null;
  }

  private async availableMethods(
    merchantId: string,
  ): Promise<Array<{ type: DeliveryPaymentMethod; label: string; instructions: string | null }>> {
    const mc = await this.prisma.merchantConfig.findUnique({
      where: { merchantId },
      select: { paymentMethods: true },
    });
    const raw: unknown = mc?.paymentMethods;
    if (!Array.isArray(raw)) return [];
    return raw
      .map(asRecord)
      .filter(
        (pm): pm is Record<string, unknown> =>
          pm !== null && DELIVERY_METHODS.includes(pm.type as DeliveryPaymentMethod),
      )
      .map((pm) => ({
        type: pm.type as DeliveryPaymentMethod,
        label: str(pm.label) ?? (pm.type as string),
        instructions: paymentInstructions(pm),
      }));
  }

  // --- Estado del checkout: helper mínimo, a unificar con CheckoutDraftStore en S3.3 ---

  private async readDraft(conversationId: string): Promise<CheckoutDraft | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const checkout = asRecord(asRecord(asRecord(conv?.metadata)?.delivery)?.checkout);
    return checkout ? (checkout as unknown as CheckoutDraft) : null;
  }

  /** Mezcla `metadata.delivery.checkout` sin pisar el resto de `metadata` ni de `delivery`. */
  private async writeDraft(conversationId: string, draft: CheckoutDraft): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const metadata = asRecord(conv?.metadata) ?? {};
    const delivery = asRecord(metadata.delivery) ?? {};
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          ...metadata,
          delivery: { ...delivery, checkout: draft },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async safe(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Tool fijar_pago failed: ${(error as Error).message}`);
      return { ok: false, error: 'PAYMENT_ERROR' };
    }
  }
}
