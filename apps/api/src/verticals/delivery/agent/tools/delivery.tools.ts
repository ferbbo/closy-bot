import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../../../services/cart.service';
import { DeliveryConfigService } from '../../config/delivery-config.service';
import { CheckoutDraftStore } from '../../checkout/checkout-draft.store';
import { DeliveryQuoteService } from '../../checkout/delivery-quote.service';
import { CartPresenter } from '../../presenters/cart.presenter';
import type {
  CheckoutDraft,
  DeliveryTurnContext,
  Fulfillment,
  LlmToolDef,
  ToolHandler,
  ToolResult,
} from '../../contracts';

const MAX_ZONES_IN_DATA = 5;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Herramientas de entrega del agente (S3.1-T2): fijar_entrega y cotizar_domicilio.
 *
 * - Estado en `Conversation.metadata.delivery.checkout` vía CheckoutDraftStore (merge).
 * - Config, carrito y zonas se leen de la BD en cada llamada (RN-00); las cifras salen de
 *   DeliveryQuoteService (RN-08 a RN-11) y del carrito persistido.
 * - NEEDS_NEIGHBORHOOD / OUT_OF_COVERAGE / BELOW_MINIMUM son DATOS (`ok:true` + `status`).
 * - Los handlers nunca lanzan. Sin logs de dirección ni texto del cliente (PII).
 */
@Injectable()
export class DeliveryTools {
  private readonly logger = new Logger(DeliveryTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'fijar_entrega',
      description:
        'Guarda los datos de entrega que dio el cliente (solo los que mencionó; lo ya guardado se conserva). ' +
        'Úsala también para corregir, ej. "no, es en Provenza" → barrio: "Provenza".',
      parameters: {
        type: 'object',
        properties: {
          direccion: { type: 'string', description: 'Dirección tal como la dio el cliente' },
          barrio: { type: 'string', description: 'Barrio de entrega' },
          referencia: { type: 'string', description: 'Punto de referencia o indicaciones' },
          modalidad: { type: 'string', enum: ['delivery', 'pickup'] },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'cotizar_domicilio',
      description:
        'Calcula zona, tarifa, tiempo estimado y total con el carrito y la entrega guardados. ' +
        'Si devuelve status distinto de OK, explícale al cliente qué falta.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];

  constructor(
    private readonly drafts: CheckoutDraftStore,
    private readonly quotes: DeliveryQuoteService,
    private readonly deliveryConfig: DeliveryConfigService,
    private readonly cartService: CartService,
    private readonly presenter: CartPresenter,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return {
      fijar_entrega: (args, ctx) => this.safe('fijar_entrega', () => this.setDelivery(args, ctx)),
      cotizar_domicilio: (_args, ctx) => this.safe('cotizar_domicilio', () => this.quote(ctx)),
    };
  }

  private async setDelivery(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const address = asString(args.direccion);
    const neighborhood = asString(args.barrio);
    const reference = asString(args.referencia);
    const mode = args.modalidad;
    if (mode !== undefined && mode !== 'delivery' && mode !== 'pickup') {
      return { ok: false, error: 'INVALID_ARGS' };
    }
    if (!address && !neighborhood && !reference && !mode) {
      return { ok: false, error: 'INVALID_ARGS' };
    }

    const config = await this.deliveryConfig.get(ctx.merchantId);
    if (mode === 'pickup' && !config.pickupEnabled) {
      return { ok: false, error: 'PICKUP_DISABLED' };
    }

    const current = await this.drafts.get(ctx.conversationId);
    const cart = await this.cartService.createOrGetActiveCart(ctx.customerId, ctx.merchantId);
    const patch: Partial<CheckoutDraft> = { cartId: cart.id };
    // Dar dirección o barrio sin modalidad implica domicilio
    const fulfillment: Fulfillment | undefined =
      (mode as Fulfillment | undefined) ?? (address || neighborhood ? 'delivery' : undefined);
    if (fulfillment) patch.fulfillment = fulfillment;
    if (address) {
      patch.address = address;
      // Una dirección nueva con barrio reconocible reemplaza el barrio previo
      const fromAddress = neighborhood ? null : this.quotes.extractNeighborhood(config, address);
      if (fromAddress) patch.neighborhood = fromAddress;
    }
    if (neighborhood) patch.neighborhood = neighborhood;
    if (reference) patch.reference = reference;

    const changed = (k: 'fulfillment' | 'address' | 'neighborhood') =>
      patch[k] !== undefined && patch[k] !== current?.[k];
    const cartChanged = current !== null && current.cartId !== cart.id;
    if (changed('fulfillment') || changed('address') || changed('neighborhood') || cartChanged) {
      patch.quote = undefined; // RN-09: la cotización previa ya no vale
      patch.summary = undefined; // RN-12: el resumen mostrado ya no coincide
    } else if (reference && reference !== current?.reference) {
      patch.summary = undefined;
    }

    const draft = await this.drafts.patch(ctx.conversationId, patch);
    const resolvedMode = draft.fulfillment ?? 'delivery';
    const pending =
      resolvedMode === 'pickup'
        ? []
        : [!draft.address && 'direccion', !draft.neighborhood && 'barrio'].filter(
            (x): x is string => typeof x === 'string',
          );
    return {
      ok: true,
      data: {
        modalidad: resolvedMode,
        direccion: draft.address ?? null,
        barrio: draft.neighborhood ?? null,
        referencia: draft.reference ?? null,
        pendiente: pending,
      },
    };
  }

  private async quote(ctx: DeliveryTurnContext): Promise<ToolResult> {
    const cart = await this.cartService.createOrGetActiveCart(ctx.customerId, ctx.merchantId);
    const view = this.presenter.toView(cart);
    if (view.lines.length === 0) return { ok: false, error: 'CART_EMPTY' };

    const draft = await this.drafts.get(ctx.conversationId);
    const fulfillment: Fulfillment = draft?.fulfillment ?? 'delivery';
    const subtotal = view.subtotal;
    const { quote, config } = await this.quotes.quoteWithConfig({
      merchantId: ctx.merchantId,
      address: draft?.address,
      neighborhood: draft?.neighborhood,
      subtotal,
      fulfillment,
    });
    if (fulfillment === 'pickup' && !config.pickupEnabled) {
      await this.drafts.patch(ctx.conversationId, { cartId: cart.id, quote: undefined });
      return { ok: false, error: 'PICKUP_DISABLED' };
    }

    if (quote.ok) {
      await this.drafts.patch(ctx.conversationId, {
        cartId: cart.id,
        fulfillment,
        quote,
        ...(quote.zoneName && !draft?.neighborhood ? { neighborhood: quote.zoneName } : {}),
      });
      return {
        ok: true,
        data: {
          status: 'OK',
          modalidad: quote.fulfillment,
          zona: quote.zoneName,
          tarifa: quote.fee,
          etaMinutos: quote.etaMinutes,
          subtotal,
          total: subtotal + quote.fee,
        },
      };
    }

    await this.drafts.patch(ctx.conversationId, { cartId: cart.id, quote: undefined });
    switch (quote.reason) {
      case 'NEEDS_NEIGHBORHOOD':
        return { ok: true, data: { status: 'NEEDS_NEIGHBORHOOD' } };
      case 'OUT_OF_COVERAGE':
        return {
          ok: true,
          data: {
            status: 'OUT_OF_COVERAGE',
            barrio: draft?.neighborhood ?? null,
            pickupDisponible: config.pickupEnabled,
            zonas: config.zones.slice(0, MAX_ZONES_IN_DATA).map((z) => z.name),
          },
        };
      case 'BELOW_MINIMUM':
        return {
          ok: true,
          data: {
            status: 'BELOW_MINIMUM',
            subtotal,
            minimo: quote.minOrder ?? null,
            faltante: quote.missing ?? null,
          },
        };
    }
  }

  private async safe(name: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Tool ${name} failed: ${(error as Error).message}`);
      return { ok: false, error: 'DELIVERY_ERROR' };
    }
  }
}
