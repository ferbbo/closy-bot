import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  ConflictException,
  ForbiddenException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { ConversationOrchestrator } from '../../orchestrator/conversation.orchestrator';
import { InboundMessageDto, InboundMessageResponseDto } from './dto/inbound-message.dto';
import { MetaWebhookPayload } from './dto/meta-webhook.dto';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { mapMetaWebhookToInboundMessages, isStatusOnlyPayload } from './whatsapp-webhook.mapper';
import { OutboxService } from '../../persistence/outbox/outbox.service';

/**
 * Controller for WhatsApp webhooks (Meta WhatsApp Cloud API)
 * Handles:
 * - GET: Webhook verification handshake
 * - POST: Inbound messages and status updates with signature validation
 */
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  private readonly verifyToken: string;

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly outboundService: WhatsAppOutboundService,
    private readonly orchestrator: ConversationOrchestrator,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
  ) {
    this.verifyToken = this.configService.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN', '');
    if (!this.verifyToken) {
      this.logger.warn('WHATSAPP_WEBHOOK_VERIFY_TOKEN not set. Webhook verification will fail.');
    }
  }

  /**
   * GET /webhooks/whatsapp - Meta webhook verification endpoint
   *
   * Meta sends a verification request when you configure the webhook URL.
   * Must respond with hub.challenge if hub.verify_token matches.
   *
   * Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
   *
   * @param hubMode - Must be "subscribe"
   * @param hubVerifyToken - Must match WHATSAPP_WEBHOOK_VERIFY_TOKEN
   * @param hubChallenge - Value to echo back
   * @returns hub.challenge as plain text
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  verifyWebhook(
    @Query('hub.mode') hubMode: string,
    @Query('hub.verify_token') hubVerifyToken: string,
    @Query('hub.challenge') hubChallenge: string,
  ): string {
    this.logger.log(`Webhook verification request: mode=${hubMode}`);

    if (hubMode !== 'subscribe') {
      this.logger.warn(`Invalid hub.mode: ${hubMode}`);
      throw new ForbiddenException('Invalid hub.mode');
    }

    if (hubVerifyToken !== this.verifyToken) {
      this.logger.warn('Invalid hub.verify_token');
      throw new ForbiddenException('Invalid verify token');
    }

    this.logger.log('Webhook verification successful');
    return hubChallenge;
  }

  /**
   * POST /webhooks/whatsapp - Main webhook endpoint for Meta events
   *
   * Receives:
   * - Inbound messages (text, media)
   * - Status updates (sent, delivered, read, failed)
   *
   * Security:
   * - Validates X-Hub-Signature-256 via MetaSignatureGuard
   * - Always returns 200 to prevent Meta retries
   *
   * Idempotency:
   * - Deduplicates by message_id (handled in WhatsAppService)
   *
   * @param payload - Raw Meta webhook payload
   * @returns 200 OK (Meta expects this for all cases)
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(MetaSignatureGuard)
  async handleMetaWebhook(
    @Body() payload: MetaWebhookPayload,
    @Req() _request: Request,
  ): Promise<{ received: boolean }> {
    this.logger.log(`Meta webhook received: object=${payload.object}`);

    // Early return for status updates
    if (isStatusOnlyPayload(payload)) {
      this.logger.debug('Status-only payload, returning 200 without processing');
      return { received: true };
    }

    // Extract and process messages
    const messages = mapMetaWebhookToInboundMessages(payload);

    if (messages.length === 0) {
      this.logger.debug('No processable messages in payload');
      return { received: true };
    }

    this.logger.log(`Processing ${messages.length} message(s)`);

    // Process each message
    for (const dto of messages) {
      await this.processMessage(dto);
    }

    return { received: true };
  }

  /**
   * POST /webhooks/whatsapp/inbound - Legacy endpoint (deprecated)
   *
   * @deprecated Use POST /webhooks/whatsapp with Meta payload format
   */
  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInbound(@Body() dto: InboundMessageDto): Promise<InboundMessageResponseDto> {
    const maskedPhone = this.maskPhone(dto.from);
    this.logger.log(
      `[LEGACY] Inbound webhook received: message_id=${dto.message_id}, from=${maskedPhone}`,
    );

    try {
      // Process and dedupe inbound message
      await this.whatsappService.processInboundMessage(dto);

      // Orchestrate + Send (legacy behavior: errors propagate)
      const result = await this.orchestrator.process({
        messageId: dto.message_id,
        from: dto.from,
        receiverPhoneId: dto.receiver_phone_id || 'default',
        text: dto.text || '',
        timestamp: new Date(dto.timestamp),
      });

      this.logger.log(
        `Orchestration complete: intent=${result.intent}, conversation=${result.conversationId}`,
      );

      // Enqueue response via outbox (transactional pattern)
      if (result.shouldSend) {
        await this.outboxService.enqueueWhatsAppText({
          merchantId: result.merchantId,
          to: dto.from,
          text: result.response,
          dedupeKey: `legacy-reply:${dto.message_id}`,
        });

        this.logger.log(`Response enqueued for eventual delivery`);
      }

      return {
        processed: true,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.debug(`Returning 200 for duplicate message: ${dto.message_id}`);

        return {
          processed: false,
          duplicate: true,
        };
      }

      // Re-throw other errors for legacy behavior
      throw error;
    }
  }

  /**
   * Shared message processing logic
   * Handles idempotency, orchestration, and outbound sending
   */
  private async processMessage(dto: InboundMessageDto): Promise<void> {
    const maskedPhone = this.maskPhone(dto.from);
    this.logger.log(`Processing message: id=${dto.message_id}, from=${maskedPhone}`);

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

        // 3. Enqueue response via outbox (transactional pattern)
        if (result.shouldSend) {
          await this.outboxService.enqueueWhatsAppText({
            merchantId: result.merchantId,
            to: dto.from,
            text: result.response,
            dedupeKey: `reply:${dto.message_id}`,
          });

          this.logger.log(`Response enqueued for eventual delivery`);
        }
      } catch (orchError) {
        this.logger.error(
          `Orchestration/outbound failed for message ${dto.message_id}`,
          orchError instanceof Error ? orchError.stack : orchError,
        );
        // Message is persisted; user can retry or we can replay later
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        // Duplicate - log and continue (still 200)
        this.logger.debug(`Duplicate message ignored: ${dto.message_id}`);
        return;
      }

      // Log other errors but don't throw (Meta expects 200)
      this.logger.error(
        `Failed to process message ${dto.message_id}`,
        error instanceof Error ? error.stack : error,
      );
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
