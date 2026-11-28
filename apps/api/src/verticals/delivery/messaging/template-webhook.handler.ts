import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import { maskPhone } from '../../../common/utils/pii.util';
import { BusinessMessengerService } from './business-messenger.service';
import { WHATSAPP_TEMPLATES } from './whatsapp-templates.catalog';

export const WABA_WEBHOOK_FIELDS = [
  'message_template_status_update',
  'template_category_update',
  'phone_number_quality_update',
] as const;
export type WabaWebhookField = (typeof WABA_WEBHOOK_FIELDS)[number];

export function isWabaWebhookField(field: string): field is WabaWebhookField {
  return (WABA_WEBHOOK_FIELDS as readonly string[]).includes(field);
}

export interface WabaWebhookValue {
  event?: string;
  message_template_name?: string;
  message_template_language?: string;
  previous_category?: string;
  new_category?: string;
  display_phone_number?: string;
  current_limit?: string;
  current_quality_rating?: string;
}

/** Eventos de calidad del número que disparan alerta (RN-31). */
const LOW_QUALITY = new Set(['FLAGGED', 'DOWNGRADE', 'RED', 'LOW', 'YELLOW', 'MEDIUM']);

/**
 * Webhooks de WABA (S1.4-T4, RN-31): estado/categoría de plantillas → `WhatsappTemplateState`;
 * recategorización a no-UTILITY o calidad baja → `alerta_operacion` al encargado.
 * Con el flag apagado es no-op (sin tocar la base).
 */
@Injectable()
export class TemplateWebhookHandler {
  private readonly logger = new Logger(TemplateWebhookHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly messenger: BusinessMessengerService,
  ) {}

  /** `entryId` es el id del WABA (entry[].id del webhook). */
  async handle(entryId: string, field: string, value: WabaWebhookValue): Promise<void> {
    if (!this.featureFlags.isDeliveryEnabled || !isWabaWebhookField(field)) return;

    const channels = await this.resolveChannels(entryId);
    if (channels.length === 0) {
      this.logger.warn(`WABA webhook ${field}: no WhatsApp channel for entry ${entryId}`);
      return;
    }
    for (const channel of channels) {
      if (field === 'phone_number_quality_update') {
        await this.onQuality(channel, value);
      } else {
        await this.onTemplate(channel, field, value);
      }
    }
  }

  private async onTemplate(
    channel: { id: string; merchantId: string },
    field: WabaWebhookField,
    value: WabaWebhookValue,
  ): Promise<void> {
    const name = value.message_template_name;
    const language = value.message_template_language;
    if (!name || !language) {
      this.logger.warn(`${field} without template name/language, ignored`);
      return;
    }
    const known = WHATSAPP_TEMPLATES.some((t) => t.name === name);
    const key = { channelId_name_language: { channelId: channel.id, name, language } };

    if (field === 'message_template_status_update') {
      const status = String(value.event ?? 'UNKNOWN').toUpperCase();
      await this.prisma.whatsappTemplateState.upsert({
        where: key,
        update: { status },
        create: {
          channelId: channel.id,
          name,
          language,
          status,
          category: known ? 'UTILITY' : 'UNKNOWN',
        },
      });
      this.logger.log(
        `Template state ${name}/${language} → status=${status} (channel ${channel.id})`,
      );
      return;
    }

    const category = String(value.new_category ?? 'UNKNOWN').toUpperCase();
    await this.prisma.whatsappTemplateState.upsert({
      where: key,
      update: { category },
      create: { channelId: channel.id, name, language, status: 'APPROVED', category },
    });
    this.logger.log(
      `Template state ${name}/${language} → category=${category} (channel ${channel.id})`,
    );

    if (category !== 'UTILITY' && known) {
      await this.messenger.alertOperation({
        merchantId: channel.merchantId,
        channelId: channel.id,
        alert: `Meta cambió la plantilla ${name} a la categoría ${category}; dejamos de usarla hasta que vuelva a UTILITY`,
        dedupeKey: `alert:template_category:${channel.id}:${name}:${language}:${category}`,
      });
    }
  }

  private async onQuality(
    channel: { id: string; merchantId: string },
    value: WabaWebhookValue,
  ): Promise<void> {
    const event = String(value.event ?? '').toUpperCase();
    const rating = String(value.current_quality_rating ?? '').toUpperCase();
    const phone = maskPhone(value.display_phone_number ?? '');
    if (!LOW_QUALITY.has(event) && !LOW_QUALITY.has(rating)) {
      this.logger.log(`Phone quality update phone=${phone} event=${event || '-'} (no alert)`);
      return;
    }
    this.logger.warn(
      `Phone quality LOW phone=${phone} event=${event || '-'} rating=${rating || '-'} limit=${value.current_limit ?? '-'} (channel ${channel.id})`,
    );
    const day = new Date().toISOString().slice(0, 10);
    await this.messenger.alertOperation({
      merchantId: channel.merchantId,
      channelId: channel.id,
      alert: `la calidad del número de WhatsApp bajó (${event || rating}); revisa los mensajes enviados y evita reclamos`,
      dedupeKey: `alert:phone_quality:${channel.id}:${event || rating}:${day}`,
    });
  }

  private resolveChannels(wabaId: string): Promise<Array<{ id: string; merchantId: string }>> {
    return this.prisma.channel.findMany({
      where: {
        type: ChannelType.WHATSAPP,
        OR: [
          { wabaId },
          { externalId: wabaId },
          { credentials: { path: ['wabaId'], equals: wabaId } },
          { credentials: { path: ['businessAccountId'], equals: wabaId } },
        ],
      },
      select: { id: true, merchantId: true },
    });
  }
}
