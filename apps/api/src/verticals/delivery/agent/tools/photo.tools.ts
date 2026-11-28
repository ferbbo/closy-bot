import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { OutboxService } from '../../../../persistence/outbox/outbox.service';
import type { DeliveryTurnContext, LlmToolDef, ToolHandler, ToolResult } from '../../contracts';

/** Texto fijo cuando la BD no tiene imagen (RN-00: nunca se inventa una URL). */
export const NO_PHOTO_TEXT = 'No tengo foto de ese producto.';
const HTTP_URL_RE = /^https?:\/\//i;

/**
 * S5.4-T3 (P1): `ver_foto_producto` envía SOLO `Product.imageUrl` (por variantId visto en
 * `buscar_producto` en el turno, RN-02) o `menuImageUrl` del DeliveryConfig leído de la BD en el
 * turno (RN-00). Sin imagen → "no tengo foto de ese producto". Nunca lanza.
 */
@Injectable()
export class PhotoTools {
  private readonly logger = new Logger(PhotoTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'ver_foto_producto',
      description:
        'Envía al cliente la foto de un producto (variantId devuelto por buscar_producto en este turno) o la imagen de la carta (menu=true). Si no hay foto en la BD responde que no la tiene.',
      parameters: {
        type: 'object',
        properties: {
          variantId: { type: 'string', description: 'variantId de buscar_producto' },
          menu: { type: 'boolean', description: 'true para la imagen de la carta' },
        },
        additionalProperties: false,
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return { ver_foto_producto: (args, ctx) => this.safe(() => this.photo(args, ctx)) };
  }

  private async photo(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    let link: string | null = null;
    let caption: string | undefined;
    let ref: string;
    if (args.menu === true) {
      link = ctx.config.menuImageUrl ?? null;
      ref = 'menu';
    } else {
      const variantId = typeof args.variantId === 'string' ? args.variantId : '';
      if (!variantId) return { ok: false, error: 'MISSING_VARIANT_OR_MENU' };
      if (!ctx.seenVariantIds.has(variantId)) return { ok: false, error: 'UNKNOWN_VARIANT' };
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: variantId, product: { merchantId: ctx.merchantId, isActive: true } },
        select: { product: { select: { id: true, name: true, imageUrl: true } } },
      });
      if (!variant) return { ok: false, error: 'UNKNOWN_VARIANT' };
      link = variant.product.imageUrl;
      caption = variant.product.name;
      ref = variant.product.id;
    }
    if (!link || !HTTP_URL_RE.test(link)) {
      return { ok: true, data: { status: 'NO_PHOTO', respuesta: NO_PHOTO_TEXT } };
    }
    const conv = await this.prisma.conversation.findUnique({
      where: { id: ctx.conversationId },
      select: { channelId: true },
    });
    await this.outbox.enqueueWhatsAppImage({
      merchantId: ctx.merchantId,
      conversationId: ctx.conversationId,
      channelId: conv?.channelId ?? undefined,
      to: ctx.customerPhone,
      link,
      caption,
      dedupeKey: `photo:${ctx.conversationId}:${ref}:${ctx.now.getTime()}`,
    });
    return { ok: true, data: { status: 'SENT', producto: caption ?? 'carta' } };
  }

  private async safe(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`photo tool failed: ${(error as Error).message}`);
      return { ok: false, error: 'PHOTO_ERROR' };
    }
  }
}
