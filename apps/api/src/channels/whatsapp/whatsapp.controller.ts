import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { ConversationOrchestrator } from '../../orchestrator/conversation.orchestrator';
import { InboundMessageDto, InboundMessageResponseDto } from './dto/inbound-message.dto';

/**
 * Controller for WhatsApp webhooks
 * Handles inbound message events with idempotency and orchestrates responses
 */
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly outboundService: WhatsAppOutboundService,
    private readonly orchestrator: ConversationOrchestrator,
  ) {}

  /**
   * Webhook endpoint for inbound WhatsApp messages
   *
   * Pipeline:
   * 1. Validate + dedupe inbound message
   * 2. Orchestrate conversation (resolve merchant, customer, classify intent)
   * 3. Send response via outbound service
   *
   * @param dto - Validated inbound message payload
   * @returns Processing status with duplicate flag if applicable
   *
   * HTTP Status:
   * - 200: Successfully processed (includes first-time and duplicates)
   * - 400: Invalid payload (handled by ValidationPipe)
   * - 500: Internal server error
   */
  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInbound(@Body() dto: InboundMessageDto): Promise<InboundMessageResponseDto> {
    const maskedPhone = this.maskPhone(dto.from);
    this.logger.log(`Inbound webhook received: message_id=${dto.message_id}, from=${maskedPhone}`);

    try {
      // 1. Process and dedupe inbound message
      await this.whatsappService.processInboundMessage(dto);

      // 2-3. Orchestrate + Send (best-effort, never block 200 after persistence)
      try {
        const result = await this.orchestrator.process({
          messageId: dto.message_id,
          from: dto.from,
          receiverPhoneId: dto.receiver_phone_id || 'default', // MVP: single merchant
          text: dto.text || '',
          timestamp: new Date(dto.timestamp),
        });

        this.logger.log(
          `Orchestration complete: intent=${result.intent}, conversation=${result.conversationId}`,
        );

        // 3. Send response if needed
        if (result.shouldSend) {
          const sendResult = await this.outboundService.sendTextMessage(dto.from, result.response);

          if (sendResult.success) {
            this.logger.log(`Response sent successfully: ${sendResult.messageId}`);
          } else {
            this.logger.error(`Failed to send response: ${sendResult.error}`);
          }
        }
      } catch (orchError) {
        this.logger.error(
          `Orchestration/outbound failed for message ${dto.message_id}`,
          orchError instanceof Error ? orchError.stack : orchError,
        );
        // Message is persisted; user can retry or we can replay later
      }

      return {
        processed: true,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        // Duplicate message - still return 200 with duplicate flag
        // This is idempotent behavior: same input -> same output
        this.logger.debug(`Returning 200 for duplicate message: ${dto.message_id}`);

        return {
          processed: false,
          duplicate: true,
        };
      }

      // Re-throw other errors for global exception filter
      throw error;
    }
  }

  /**
   * Mask phone number for PII protection in logs
   * Example: +573001234567 -> +57300****567
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '****';
    return phone.slice(0, 6) + '****' + phone.slice(-3);
  }
}
