import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CartService, normalizeCartNotes } from '../../../../services/cart.service';
import type { CartWithItems } from '../../../../persistence/repositories/cart.repository';
import { CartItemRepository } from '../../../../persistence/repositories/cart-item.repository';
import { ProductRepository } from '../../../../persistence/repositories/product.repository';
import { CartPresenter } from '../../presenters/cart.presenter';
import type {
  CartView,
  DeliveryTurnContext,
  LlmToolDef,
  ToolHandler,
  ToolResult,
} from '../../contracts';

/** Máximo de líneas detalladas en `data` (ToolResult compacto, ≤ 5 ítems). */
const MAX_LINES_IN_DATA = 5;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function asInt(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) ? n : undefined;
}

/**
 * Herramientas de carrito del agente (S2.2-T3): agregar_al_carrito, quitar_del_carrito, ver_carrito.
 *
 * - Todo se lee de la BD en el turno (RN-00); las cifras salen solo de CartPresenter (RN-01).
 * - RN-02: agregar_al_carrito solo acepta variantIds de `ctx.seenVariantIds`.
 * - RN-03: cantidad 1..maxQtyPerLine por línea y ≤ maxLines líneas.
 * - RN-04: con trackStock=false no se valida stock; manda ProductVariant.isActive.
 * - Los handlers nunca lanzan: devuelven ToolResult {ok, data?, error?}.
 */
@Injectable()
export class CartTools {
  private readonly logger = new Logger(CartTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'agregar_al_carrito',
      description:
        'Agrega un producto al carrito. Usa solo un variantId devuelto por buscar_producto en este turno.',
      parameters: {
        type: 'object',
        properties: {
          variantId: { type: 'string', description: 'variantId devuelto por buscar_producto' },
          cantidad: { type: 'integer', minimum: 1, description: 'Unidades a agregar' },
          notas: { type: 'string', description: 'Indicaciones del ítem, ej. "sin cebolla"' },
        },
        required: ['variantId', 'cantidad'],
        additionalProperties: false,
      },
    },
    {
      name: 'quitar_del_carrito',
      description:
        'Quita un ítem del carrito o reduce su cantidad. Indica itemId (de ver_carrito) o variantId.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'itemId de la línea (ver_carrito)' },
          variantId: { type: 'string', description: 'variantId del producto a quitar' },
          cantidad: {
            type: 'integer',
            minimum: 1,
            description: 'Unidades a quitar; si se omite se quita la línea completa',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'ver_carrito',
      description: 'Muestra el carrito actual con notas y subtotal calculado por el sistema.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];

  constructor(
    private readonly cartService: CartService,
    private readonly cartItemRepository: CartItemRepository,
    private readonly productRepository: ProductRepository,
    private readonly presenter: CartPresenter,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return {
      agregar_al_carrito: (args, ctx) => this.safe('agregar_al_carrito', () => this.add(args, ctx)),
      quitar_del_carrito: (args, ctx) =>
        this.safe('quitar_del_carrito', () => this.remove(args, ctx)),
      ver_carrito: (_args, ctx) => this.safe('ver_carrito', () => this.view(ctx)),
    };
  }

  private async add(args: Record<string, unknown>, ctx: DeliveryTurnContext): Promise<ToolResult> {
    const variantId = asString(args.variantId);
    if (!variantId) return { ok: false, error: 'INVALID_ARGS' };

    // RN-02 (AC-04): antes de cualquier lectura o escritura
    if (!ctx.seenVariantIds.has(variantId)) return { ok: false, error: 'VARIANT_NOT_SEEN' };

    const maxQty = ctx.config.maxQtyPerLine;
    const qty = asInt(args.cantidad);
    if (qty === undefined || qty < 1 || qty > maxQty) {
      return { ok: false, error: 'INVALID_QUANTITY', data: { maxQtyPerLine: maxQty } };
    }

    const product = await this.productRepository.findByVariantId(variantId);
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant || product.merchantId !== ctx.merchantId) {
      return { ok: false, error: 'VARIANT_NOT_FOUND' };
    }
    if (!variant.isActive || !product.isActive) return { ok: false, error: 'VARIANT_INACTIVE' };

    const notes = normalizeCartNotes(asString(args.notas));
    const cart = await this.cartService.createOrGetActiveCart(ctx.customerId, ctx.merchantId);
    const line = cart.items.find((i) => i.variantId === variantId && (i.notes ?? '') === notes);
    if (!line && cart.items.length >= ctx.config.maxLines) {
      return { ok: false, error: 'MAX_LINES', data: { maxLines: ctx.config.maxLines } };
    }
    if (line && line.quantity + qty > maxQty) {
      return {
        ok: false,
        error: 'INVALID_QUANTITY',
        data: { maxQtyPerLine: maxQty, inCart: line.quantity },
      };
    }

    let updated: CartWithItems;
    try {
      updated = await this.cartService.addItem(ctx.customerId, ctx.merchantId, variantId, qty, {
        notes,
        skipStockCheck: !ctx.config.trackStock,
      });
    } catch (error) {
      if (error instanceof BadRequestException) return { ok: false, error: 'OUT_OF_STOCK' };
      throw error;
    }
    return { ok: true, data: this.compact(this.presenter.toView(updated)) };
  }

  private async remove(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const itemId = asString(args.itemId);
    const variantId = asString(args.variantId);
    if (!itemId && !variantId) return { ok: false, error: 'INVALID_ARGS' };
    const qty = args.cantidad === undefined ? undefined : asInt(args.cantidad);
    if (args.cantidad !== undefined && (qty === undefined || qty < 1)) {
      return { ok: false, error: 'INVALID_QUANTITY' };
    }

    const cart = await this.cartService.createOrGetActiveCart(ctx.customerId, ctx.merchantId);
    const view = this.presenter.toView(cart);
    const matches = itemId
      ? cart.items.filter((i) => i.id === itemId)
      : cart.items.filter((i) => i.variantId === variantId);
    if (matches.length === 0) return { ok: false, error: 'ITEM_NOT_IN_CART' };
    if (matches.length > 1) {
      // Mismo producto con notas distintas: el LLM debe preguntar cuál (RN-05)
      const ids = new Set(matches.map((m) => m.id));
      return {
        ok: false,
        error: 'AMBIGUOUS_ITEM',
        data: {
          options: view.lines
            .filter((l) => ids.has(l.itemId))
            .slice(0, MAX_LINES_IN_DATA)
            .map(({ itemId: id, label, notes, quantity }) => ({
              itemId: id,
              label,
              notes,
              quantity,
            })),
        },
      };
    }

    const line = matches[0];
    let updated: CartWithItems;
    if (qty === undefined || qty >= line.quantity) {
      updated = await this.cartService.removeItem(cart.id, line.id);
    } else {
      // Reducir nunca excede el stock: se actualiza directo para no aplicar el chequeo
      // de stock legacy de updateQuantity (RN-04, trackStock=false).
      await this.cartItemRepository.updateQuantity(line.id, line.quantity - qty);
      updated = await this.cartService.getCart(cart.id);
    }
    return { ok: true, data: this.compact(this.presenter.toView(updated)) };
  }

  private async view(ctx: DeliveryTurnContext): Promise<ToolResult> {
    const cart = await this.cartService.createOrGetActiveCart(ctx.customerId, ctx.merchantId);
    return { ok: true, data: this.compact(this.presenter.toView(cart)) };
  }

  /** `data` compacto: ≤ 5 líneas detalladas + bloque exacto del presenter para citar. */
  private compact(view: CartView): Record<string, unknown> {
    return {
      cartId: view.cartId,
      lines: view.lines.slice(0, MAX_LINES_IN_DATA),
      moreLines: Math.max(0, view.lines.length - MAX_LINES_IN_DATA),
      subtotal: view.subtotal,
      text: this.presenter.render(view),
    };
  }

  private async safe(name: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Tool ${name} failed: ${(error as Error).message}`);
      return { ok: false, error: 'CART_ERROR' };
    }
  }
}
