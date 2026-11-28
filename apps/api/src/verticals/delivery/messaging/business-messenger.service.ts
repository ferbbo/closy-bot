import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { OutboxService } from '../../../persistence/outbox/outbox.service';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import { maskPhone } from '../../../common/utils/pii.util';
import type { BusinessMessenger, NotifyRequest, NotifyResult } from '../contracts';
import { CustomerServiceWindowService, phoneVariants } from './customer-service-window.service';
import { resolveNotificationSettings } from './notification-settings';
import {
  getTemplateDefinition,
  renderTemplateBody,
  sanitizeTemplateParam,
} from './whatsapp-templates.catalog';

export interface OperationAlert {
  merchantId: string;
  channelId?: string | null;
  alert: string;
  orderCode?: string | null;
  orderId?: string | null;
  /** dedupeKey estable (una alerta por evento). */
  dedupeKey: string;
}

/**
 * BusinessMessenger (S1.4-T3, F-22). Único camino para mensajes iniciados por el negocio:
 * decide plantilla (SEND_TEMPLATE) o texto (SEND_TEXT) aplicando, en orden:
 * flag → duplicado → opt-out (RN-29) → tope por pedido (RN-30) → modo/ventana/estado de
 * plantilla (RN-31).
 */
@Injectable()
export class BusinessMessengerService implements BusinessMessenger {
  private readonly logger = new Logger(BusinessMessengerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly window: CustomerServiceWindowService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async notify(req: NotifyRequest): Promise<NotifyResult> {
    const def = getTemplateDefinition(req.template);
    const to = maskPhone(req.to);

    if (!this.featureFlags.isDeliveryEnabled) {
      this.logger.debug(`notify skipped (delivery disabled): template=${req.template}`);
      return this.skip(req, 'TEMPLATE_NOT_USABLE');
    }

    const existing = await this.prisma.outboxMessage.findUnique({
      where: { merchantId_dedupeKey: { merchantId: req.merchantId, dedupeKey: req.dedupeKey } },
      select: { id: true },
    });
    if (existing) return this.skip(req, 'DUPLICATE');

    if (def.audience === 'customer' && (await this.isOptedOut(req))) {
      return this.skip(req, 'OPTED_OUT');
    }

    const merchantConfig = await this.prisma.merchantConfig.findUnique({
      where: { merchantId: req.merchantId },
      select: { deliveryConfig: true },
    });
    const settings = resolveNotificationSettings(merchantConfig?.deliveryConfig);

    if (req.orderId) {
      const prefix = `order:${req.orderId}:`;
      if (!req.dedupeKey.startsWith(prefix)) {
        this.logger.warn(`dedupeKey for order notification should start with "${prefix}"`);
      }
      const sent = await this.prisma.outboxMessage.count({
        where: { merchantId: req.merchantId, to: req.to, dedupeKey: { startsWith: prefix } },
      });
      if (sent >= settings.maxBusinessInitiatedPerOrder) return this.skip(req, 'CAP_REACHED');
    }

    const params: Record<string, string> = {};
    for (const spec of def.params) {
      params[spec.name] = sanitizeTemplateParam(req.params[spec.name], spec.maxLength) || '-';
    }
    const rendered = renderTemplateBody(def, params);
    const channelId = req.channelId ?? (await this.resolveChannelId(req.merchantId));
    const windowOpen = await this.window.isOpen(req.merchantId, req.to);

    if (settings.mode === 'auto' && windowOpen) {
      return this.enqueueText(req, channelId, req.freeText ?? rendered);
    }

    const state = channelId
      ? await this.prisma.whatsappTemplateState.findUnique({
          where: {
            channelId_name_language: {
              channelId,
              name: def.name,
              language: settings.templateLanguage,
            },
          },
          select: { status: true, category: true },
        })
      : null;
    // Sin fila de estado (aún no llegó webhook) se asume la plantilla registrada por el script.
    const usable = !state || (state.status === 'APPROVED' && state.category === 'UTILITY');

    if (usable) {
      const msg = await this.outbox.enqueueWhatsAppTemplate({
        merchantId: req.merchantId,
        conversationId: req.conversationId ?? undefined,
        channelId: channelId ?? undefined,
        to: req.to,
        templateName: def.name,
        languageCode: settings.templateLanguage,
        params,
        dedupeKey: req.dedupeKey,
        renderedText: rendered,
      });
      this.logger.log(`notify queued template=${def.name} to=${to} dedupeKey=${req.dedupeKey}`);
      return { status: 'queued', channel: 'template', outboxId: msg.id };
    }

    if (def.name !== 'alerta_operacion') {
      await this.alertOperation({
        merchantId: req.merchantId,
        channelId,
        orderId: req.orderId,
        orderCode: req.params.order_code,
        alert: `la plantilla ${def.name} no se puede usar (estado ${state?.status}, categoría ${state?.category}); revísala en WhatsApp Manager`,
        dedupeKey: `alert:template_not_usable:${channelId}:${def.name}:${state?.status}:${state?.category}`,
      });
    }
    if (windowOpen) return this.enqueueText(req, channelId, req.freeText ?? rendered);
    return this.skip(req, 'TEMPLATE_NOT_USABLE');
  }

  /** Alerta `alerta_operacion` al encargado (Merchant.whatsappNumber). Best-effort. */
  async alertOperation(alert: OperationAlert): Promise<NotifyResult | null> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: alert.merchantId },
      select: { name: true, whatsappNumber: true },
    });
    if (!merchant?.whatsappNumber) {
      this.logger.warn(
        `alerta_operacion skipped: merchant ${alert.merchantId} has no whatsappNumber`,
      );
      return null;
    }
    try {
      return await this.notify({
        merchantId: alert.merchantId,
        channelId: alert.channelId ?? null,
        to: merchant.whatsappNumber,
        template: 'alerta_operacion',
        params: {
          merchant_name: merchant.name,
          alert: alert.alert,
          order_code: alert.orderCode || '-',
        },
        dedupeKey: alert.dedupeKey,
      });
    } catch (error) {
      this.logger.error(`alerta_operacion failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async isOptedOut(req: NotifyRequest): Promise<boolean> {
    if (req.conversationId) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: req.conversationId },
        select: { optedOutAt: true },
      });
      if (conv) return conv.optedOutAt !== null;
    }
    const opted = await this.prisma.conversation.findFirst({
      where: {
        merchantId: req.merchantId,
        optedOutAt: { not: null },
        customer: { phone: { in: phoneVariants(req.to) } },
      },
      select: { id: true },
    });
    return opted !== null;
  }

  private async resolveChannelId(merchantId: string): Promise<string | null> {
    const channel = await this.prisma.channel.findFirst({
      where: { merchantId, type: ChannelType.WHATSAPP, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return channel?.id ?? null;
  }

  private async enqueueText(
    req: NotifyRequest,
    channelId: string | null,
    text: string,
  ): Promise<NotifyResult> {
    const msg = await this.outbox.enqueueWhatsAppText({
      merchantId: req.merchantId,
      conversationId: req.conversationId ?? undefined,
      channelId: channelId ?? undefined,
      to: req.to,
      text,
      dedupeKey: req.dedupeKey,
    });
    this.logger.log(
      `notify queued text template=${req.template} to=${maskPhone(req.to)} dedupeKey=${req.dedupeKey}`,
    );
    return { status: 'queued', channel: 'text', outboxId: msg.id };
  }

  private skip(
    req: NotifyRequest,
    reason: Extract<NotifyResult, { status: 'skipped' }>['reason'],
  ): NotifyResult {
    this.logger.log(
      `notify skipped reason=${reason} template=${req.template} to=${maskPhone(req.to)} dedupeKey=${req.dedupeKey}`,
    );
    return { status: 'skipped', reason };
  }
}
