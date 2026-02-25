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
}
