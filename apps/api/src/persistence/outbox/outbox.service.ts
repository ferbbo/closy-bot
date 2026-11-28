import { Injectable, Logger } from '@nestjs/common';
import { Prisma, OutboxChannel, OutboxMessageType } from '@prisma/client';
import { OutboxRepository } from '../repositories/outbox.repository';
import { maskPhone } from '../../common/utils/pii.util';

export interface EnqueueWhatsAppTextParams {
  merchantId: string;
  conversationId?: string; // PR-03.10: For outbound message logging
  channelId?: string; // PR-03.11 AC-12: For multi-channel routing
  to: string;
  text: string;
  replyToMessageId?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Delivery (S1.4): parámetros para encolar una plantilla de WhatsApp (`SEND_TEMPLATE`).
 * `dedupeKey` es obligatorio: los mensajes iniciados por el negocio siempre son idempotentes.
 */
export interface EnqueueWhatsAppTemplateParams {
  merchantId: string;
  conversationId?: string;
  channelId?: string;
  to: string;
  templateName: string;
  languageCode: string;
  params: Record<string, string>;
  dedupeKey: string;
  /** Cuerpo renderizado (para MessageLog tras el envío); no se loguea. */
  renderedText?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Delivery (S5.4): parámetros para encolar un mensaje interactivo con botones (`SEND_INTERACTIVE`).
 * `dedupeKey` obligatorio (idempotente por `@@unique([merchantId, dedupeKey])`).
 */
export interface EnqueueWhatsAppInteractiveParams {
  merchantId: string;
  conversationId?: string;
  channelId?: string;
  to: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

/**
 * Service for enqueueing outbound messages via transactional outbox pattern
 * Provides high-level API for adding messages to the outbox
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly outboxRepo: OutboxRepository) {}

  /**
   * Enqueue a WhatsApp text message for eventual delivery
   *
   * @param params Message parameters
   * @returns Created (or existing) OutboxMessage
   */
  async enqueueWhatsAppText(params: EnqueueWhatsAppTextParams) {
    const {
      merchantId,
      conversationId,
      channelId,
      to,
      text,
      replyToMessageId,
      dedupeKey,
      metadata,
    } = params;

    const maskedPhone = maskPhone(to);

    // Generate dedupeKey if not provided (using masked phone for PII safety)
    const finalDedupeKey =
      dedupeKey ?? `whatsapp:text:${maskedPhone}:${Date.now()}:${Math.random()}`;

    const payloadJson = {
      text,
      replyToMessageId,
      metadata,
    };

    // AC-08: INFO level does not log message text (PII-safe)
    this.logger.log(
      `Enqueueing WhatsApp text: to=${maskedPhone}, length=${text.length} chars, dedupeKey=${finalDedupeKey}`,
    );

    // DEBUG level may include truncated text for development
    this.logger.debug(`Message content preview: "${text.substring(0, 50)}..."`);

    // PR-03.11: Build create input with optional channelRef relation (AC-12)
    const createInput: {
      merchant: { connect: { id: string } };
      conversationId?: string;
      channel: OutboxChannel;
      type: OutboxMessageType;
      to: string;
      payloadJson: Prisma.InputJsonValue;
      dedupeKey: string;
      channelRef?: { connect: { id: string } };
    } = {
      merchant: { connect: { id: merchantId } },
      conversationId, // PR-03.10: For outbound message logging
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to,
      payloadJson: payloadJson as unknown as Prisma.InputJsonValue,
      dedupeKey: finalDedupeKey,
    };

    // PR-03.11 AC-12: Connect channel if provided
    if (channelId) {
      createInput.channelRef = { connect: { id: channelId } };
    }

    const message = await this.outboxRepo.create(createInput);

    this.logger.debug(`Enqueued OutboxMessage id=${message.id}, status=${message.status}`);

    return message;
  }

  /**
   * Delivery (S1.4): encola una plantilla utility de WhatsApp (`SEND_TEMPLATE`).
   * Idempotente por `@@unique([merchantId, dedupeKey])`.
   */
  async enqueueWhatsAppTemplate(params: EnqueueWhatsAppTemplateParams) {
    const { merchantId, conversationId, channelId, to, dedupeKey } = params;

    const payloadJson = {
      template: {
        name: params.templateName,
        languageCode: params.languageCode,
        params: params.params,
      },
      renderedText: params.renderedText,
      metadata: params.metadata,
    };

    this.logger.log(
      `Enqueueing WhatsApp template: name=${params.templateName}, to=${maskPhone(to)}, dedupeKey=${dedupeKey}`,
    );

    const createInput: {
      merchant: { connect: { id: string } };
      conversationId?: string;
      channel: OutboxChannel;
      type: OutboxMessageType;
      to: string;
      payloadJson: Prisma.InputJsonValue;
      dedupeKey: string;
      channelRef?: { connect: { id: string } };
    } = {
      merchant: { connect: { id: merchantId } },
      conversationId,
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEMPLATE,
      to,
      payloadJson: payloadJson as unknown as Prisma.InputJsonValue,
      dedupeKey,
    };
    if (channelId) {
      createInput.channelRef = { connect: { id: channelId } };
    }

    return this.outboxRepo.create(createInput);
  }

  /**
   * Delivery (S5.4): encola un mensaje interactivo con botones de respuesta (`SEND_INTERACTIVE`).
   * El dispatcher guarda `body` en MessageLog para la memoria de la conversación.
   */
  async enqueueWhatsAppInteractive(params: EnqueueWhatsAppInteractiveParams) {
    const payloadJson = {
      interactive: { body: params.body, buttons: params.buttons },
      metadata: params.metadata,
    };
    this.logger.log(
      `Enqueueing WhatsApp interactive: to=${maskPhone(params.to)}, buttons=${params.buttons.length}, dedupeKey=${params.dedupeKey}`,
    );
    return this.outboxRepo.create(
      this.buildCreateInput(params, OutboxMessageType.SEND_INTERACTIVE, payloadJson),
    );
  }

  private buildCreateInput(
    params: {
      merchantId: string;
      conversationId?: string;
      channelId?: string;
      to: string;
      dedupeKey: string;
    },
    type: OutboxMessageType,
    payloadJson: unknown,
  ) {
    return {
      merchant: { connect: { id: params.merchantId } },
      conversationId: params.conversationId,
      channel: OutboxChannel.WHATSAPP,
      type,
      to: params.to,
      payloadJson: payloadJson as unknown as Prisma.InputJsonValue,
      dedupeKey: params.dedupeKey,
      ...(params.channelId ? { channelRef: { connect: { id: params.channelId } } } : {}),
    };
  }
}
