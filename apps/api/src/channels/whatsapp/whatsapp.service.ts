import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MessageRepository } from '../../persistence/repositories/message.repository';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { NormalizedMessage } from '../interfaces/message.interface';

/**
 * Service for WhatsApp message processing
 * Implements idempotent message handling via repository layer
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly messageRepository: MessageRepository) {}

  /**
   * Process inbound WhatsApp message with idempotency guarantee
   *
   * @param dto - Validated inbound message DTO
   * @returns Normalized message object
   * @throws ConflictException if message_id already exists (duplicate)
   */
  async processInboundMessage(dto: InboundMessageDto): Promise<NormalizedMessage> {
    // Mask phone number for logs (show only last 4 digits)
    const maskedPhone = this.maskPhone(dto.from);

    this.logger.log(`Processing inbound message: ${dto.message_id} from ${maskedPhone}`);

    try {
      // Attempt to persist message with unique constraint on messageId
      const inboundMessage = await this.messageRepository.create({
        messageId: dto.message_id,
        from: dto.from,
        timestamp: new Date(dto.timestamp),
        text: dto.text,
        mediaType: dto.media_type,
        mediaUrl: dto.media_url,
        processed: false,
      });

      this.logger.log(`Message persisted successfully: ${inboundMessage.id}`);

      // Return normalized message for downstream processing
      return this.toNormalizedMessage(inboundMessage);
    } catch (error) {
      // Handle Prisma unique constraint violation (P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn(`Duplicate message detected: ${dto.message_id} from ${maskedPhone}`);
        throw new ConflictException('Duplicate message_id');
      }

      // Re-throw unexpected errors
      this.logger.error(`Failed to process message: ${dto.message_id}`, error);
      throw error;
    }
  }

  /**
   * Convert persisted InboundMessage to NormalizedMessage interface
   */
  private toNormalizedMessage(inboundMessage: {
    messageId: string;
    from: string;
    timestamp: Date;
    text: string | null;
    mediaType: string | null;
    mediaUrl: string | null;
  }): NormalizedMessage {
    const normalized: NormalizedMessage = {
      messageId: inboundMessage.messageId,
      channel: 'whatsapp',
      userExternalId: inboundMessage.from,
      timestamp: inboundMessage.timestamp,
    };

    if (inboundMessage.text) {
      normalized.text = inboundMessage.text;
    }

    if (inboundMessage.mediaType && inboundMessage.mediaUrl) {
      normalized.attachments = [
        {
          type: inboundMessage.mediaType as 'image' | 'document' | 'audio' | 'video',
          url: inboundMessage.mediaUrl,
        },
      ];
    }

    return normalized;
  }

  /**
   * Mask phone number for PII protection in logs
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return '****' + phone.slice(-4);
  }
}
