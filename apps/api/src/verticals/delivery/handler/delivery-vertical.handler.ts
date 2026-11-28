import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MessageDirection, Prisma } from '@prisma/client';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { HandoffService } from '../../../services/handoff.service';
import { VerticalRouterService } from '../../vertical-router.service';
import type {
  ConversationalCandidates,
  DeliveryTurnResult,
  VerticalContext,
  VerticalHandler,
  VerticalResult,
} from '../contracts';
import { DeliveryConfigService } from '../config/delivery-config.service';
import { DeliveryAgentService } from '../agent/delivery-agent.service';
import { DELIVERY_TEXTS, isInfoQuery, isOffTopic, isOptOut } from '../agent/delivery-agent.prompt';
import { MediaRouter } from '../media/media-router.service';

interface DeliveryMeta {
  privacyNoticeAt?: string;
  lastCandidates?: ConversationalCandidates | null;
  [key: string]: unknown;
}

const HISTORY_LIMIT = 8;

/**
 * DeliveryVerticalHandler (S2.3-T3): entrada de la vertical de domicilios.
 * canHandle: flag + industria restaurante, sin tocar la BD (RN-21).
 * Guards en orden: opt-out (RN-29) → privacidad (RN-18, prefijo una vez) → temas ajenos (RN-19)
 * → comercio incompleto (AC-41, handoff) → horario (RN-07; consultas de menú pasan) → agente.
 * El handoff activo lo releva el orquestador antes de llegar aquí.
 */
@Injectable()
export class DeliveryVerticalHandler implements VerticalHandler, OnModuleInit {
  readonly name = 'delivery';
  private readonly logger = new Logger(DeliveryVerticalHandler.name);

  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly prisma: PrismaService,
    private readonly deliveryConfig: DeliveryConfigService,
    private readonly agent: DeliveryAgentService,
    private readonly router: VerticalRouterService,
    private readonly moduleRef: ModuleRef,
    private readonly mediaRouter: MediaRouter,
  ) {}

  onModuleInit(): void {
    this.router.register(this);
  }

  async canHandle(ctx: VerticalContext): Promise<boolean> {
    return this.flags.isDeliveryEnabled && ctx.merchant.industry === 'restaurante';
  }

  async handle(ctx: VerticalContext): Promise<VerticalResult | null> {
    // S5.0-T3: audio/imagen se resuelven antes de los guards de texto.
    const media = await this.mediaRouter.route(ctx);
    if (media.action === 'reply') {
      return this.result(media.response, 'DELIVERY_GUARD');
    }
    const text = media.action === 'continue' ? media.text : (ctx.input.text ?? '');
    const echoPrefix = media.action === 'continue' ? media.echoPrefix : '';
    // Wall clock (ms): the webhook timestamp has 1 s precision and RN-12 compares turns
    const now = new Date();
    const conv = await this.prisma.conversation.findUnique({
      where: { id: ctx.conversation.id },
      select: { metadata: true, optedOutAt: true },
    });
    const metadata = (conv?.metadata ?? {}) as Record<string, unknown>;
    const delivery: DeliveryMeta = { ...((metadata.delivery as DeliveryMeta | undefined) ?? {}) };

    // RN-29: opt-out de mensajes iniciados por el negocio
    if (isOptOut(text)) {
      await this.prisma.conversation.update({
        where: { id: ctx.conversation.id },
        data: { optedOutAt: conv?.optedOutAt ?? now },
      });
      return this.result(DELIVERY_TEXTS.optOutConfirmation, 'DELIVERY_GUARD');
    }

    const { config, completeness } = await this.deliveryConfig.getWithCompleteness(ctx.merchant.id);

    // RN-18: aviso de privacidad una sola vez por conversación
    let prefix = '';
    if (!delivery.privacyNoticeAt && config.privacyPolicyUrl) {
      prefix = `${DELIVERY_TEXTS.privacyNotice(config.privacyPolicyUrl)}\n\n`;
      delivery.privacyNoticeAt = now.toISOString();
    }

    let out: { text: string; intent: DeliveryTurnResult['intent'] };
    let reactivate = false;
    if (isOffTopic(text)) {
      out = { text: DELIVERY_TEXTS.offTopic, intent: 'DELIVERY_GUARD' };
    } else if (!completeness.complete) {
      await this.openHandoff(ctx);
      this.logger.warn(
        JSON.stringify({
          event: 'delivery.incomplete_store',
          merchantId: ctx.merchant.id,
          missing: completeness.missing,
        }),
      );
      out = { text: DELIVERY_TEXTS.incompleteStore, intent: 'DELIVERY_GUARD' };
    } else {
      const open = this.deliveryConfig.isOpen(config, now);
      if (!open.open && !isInfoQuery(text)) {
        out = { text: DELIVERY_TEXTS.closed(open.nextOpening), intent: 'DELIVERY_GUARD' };
      } else {
        const turn = await this.agent.handleTurn({
          ctx: {
            merchantId: ctx.merchant.id,
            customerId: ctx.customer.id,
            conversationId: ctx.conversation.id,
            customerPhone: ctx.customer.phone,
            text,
            config,
            now,
            seenVariantIds: new Set<string>(),
          },
          merchantName: ctx.merchant.name,
          history: await this.history(ctx),
          lastCandidates: delivery.lastCandidates ?? null,
        });
        if (turn.candidates?.length) {
          delivery.lastCandidates = { items: turn.candidates, createdAt: now.toISOString() };
        }
        reactivate = turn.toolTrace.some((t) => t.name === 'agregar_al_carrito' && t.ok);
        out = { text: turn.text, intent: 'DELIVERY_ORDER' };
      }
    }

    // Re-read: tools may have written metadata.delivery.checkout during the turn (S3.x).
    // Only the handler's own keys are merged over the fresh state.
    const fresh = await this.prisma.conversation.findUnique({
      where: { id: ctx.conversation.id },
      select: { metadata: true },
    });
    const freshMeta = (fresh?.metadata ?? {}) as Record<string, unknown>;
    const freshDelivery = (freshMeta.delivery as DeliveryMeta | undefined) ?? {};
    await this.prisma.conversation.update({
      where: { id: ctx.conversation.id },
      data: {
        metadata: {
          ...freshMeta,
          delivery: {
            ...freshDelivery,
            privacyNoticeAt: delivery.privacyNoticeAt,
            lastCandidates: delivery.lastCandidates ?? freshDelivery.lastCandidates ?? null,
          },
        } as unknown as Prisma.InputJsonValue,
        // RN-29: un nuevo pedido del cliente reactiva los mensajes del negocio
        ...(reactivate && conv?.optedOutAt ? { optedOutAt: null } : {}),
      },
    });
    return this.result(echoPrefix + prefix + out.text, out.intent);
  }

  private async history(
    ctx: VerticalContext,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const rows = await this.prisma.messageLog.findMany({
      where: {
        conversationId: ctx.conversation.id,
        NOT: { providerMessageId: ctx.input.messageId },
        text: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { direction: true, text: true },
    });
    return rows.reverse().map((r) => ({
      role: r.direction === MessageDirection.IN ? ('user' as const) : ('assistant' as const),
      content: r.text ?? '',
    }));
  }

  private async openHandoff(ctx: VerticalContext): Promise<void> {
    try {
      const handoff = this.moduleRef.get(HandoffService, { strict: false });
      await handoff.createHandoff(
        {
          conversationId: ctx.conversation.id,
          customerId: ctx.customer.id,
          merchantId: ctx.merchant.id,
          merchant: {
            id: ctx.merchant.id,
            name: ctx.merchant.name,
            industry: 'restaurante',
            playbookConfig: ctx.merchant.playbookConfig as Record<string, unknown> | null,
          },
        },
        'auto_escalation',
      );
    } catch (error) {
      this.logger.error(`Handoff for incomplete store failed: ${(error as Error).message}`);
    }
  }

  private result(response: string, intent: DeliveryTurnResult['intent']): VerticalResult {
    return { response, shouldSend: true, intent };
  }
}
