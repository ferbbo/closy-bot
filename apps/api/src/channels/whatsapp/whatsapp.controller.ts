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
import { InboundMessageDto, InboundMessageResponseDto } from './dto/inbound-message.dto';

/**
 * Controller for WhatsApp webhooks
 * Handles inbound message events with idempotency
 */
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Webhook endpoint for inbound WhatsApp messages
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
    this.logger.log(`Inbound webhook received: message_id=${dto.message_id}`);

    try {
      await this.whatsappService.processInboundMessage(dto);

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
}
