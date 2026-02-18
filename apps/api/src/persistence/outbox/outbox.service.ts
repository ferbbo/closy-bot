import { Injectable, Logger } from '@nestjs/common';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxChannel, OutboxMessageType } from '@prisma/client';
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

    const message = await this.outboxRepo.create({
      merchant: { connect: { id: merchantId } },
      conversationId, // PR-03.10: For outbound message logging
      channelId, // PR-03.11 AC-12
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to,
      payloadJson,
      dedupeKey: finalDedupeKey,
    });

    this.logger.debug(`Enqueued OutboxMessage id=${message.id}, status=${message.status}`);

    return message;
  }
}
