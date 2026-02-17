import { Injectable, Logger } from '@nestjs/common';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxChannel, OutboxMessageType } from '@prisma/client';

export interface EnqueueWhatsAppTextParams {
  merchantId: string;
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
    const { merchantId, to, text, replyToMessageId, dedupeKey, metadata } = params;

    const maskedPhone = this.maskPhone(to);

    // Generate dedupeKey if not provided (using masked phone for PII safety)
    const finalDedupeKey =
      dedupeKey ?? `whatsapp:text:${maskedPhone}:${Date.now()}:${Math.random()}`;

    const payloadJson = {
      text,
      replyToMessageId,
      metadata,
    };

    const truncatedText = text.substring(0, 50);

    this.logger.log(
      `Enqueueing WhatsApp text: to=${maskedPhone}, text="${truncatedText}...", dedupeKey=${finalDedupeKey}`,
    );

    const message = await this.outboxRepo.create({
      merchant: { connect: { id: merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to,
      payloadJson,
      dedupeKey: finalDedupeKey,
    });

    this.logger.debug(`Enqueued OutboxMessage id=${message.id}, status=${message.status}`);

    return message;
  }

  /**
   * Mask phone number for PII-safe logging
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '***';
    return `***${phone.slice(-4)}`;
  }
}
