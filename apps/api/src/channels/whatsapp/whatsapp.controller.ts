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
import { ModuleRef } from '@nestjs/core';
import { ChannelType } from '@prisma/client'; // PR-03.11
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { ConversationOrchestrator } from '../../orchestrator/conversation.orchestrator';
import { MerchantResolverService } from '../../services/merchant-resolver.service'; // PR-03.11
import { InboundMessageDto, InboundMessageResponseDto } from './dto/inbound-message.dto';
import { MetaWebhookPayload } from './dto/meta-webhook.dto';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { mapMetaWebhookToInboundMessages, isStatusOnlyPayload } from './whatsapp-webhook.mapper';
import { OutboxService } from '../../persistence/outbox/outbox.service';
import { maskPhone } from '../../common/utils/pii.util';
import {
  TemplateWebhookHandler,
  WabaWebhookValue,
  isWabaWebhookField,
} from '../../verticals/delivery/messaging/template-webhook.handler';

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
    private readonly merchantResolver: MerchantResolverService, // PR-03.11
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly moduleRef: ModuleRef, // Delivery S1.4-T4: resolución perezosa del handler WABA
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

    // Delivery S1.4-T4: cambios de WABA (plantillas / calidad). No-op si el handler no está
    // registrado o el flag está apagado; nunca afecta al procesamiento de `messages`.
    await this.handleWabaChanges(payload);

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
   * Delivery S1.4-T4: delega `message_template_status_update`, `template_category_update` y
   * `phone_number_quality_update` a TemplateWebhookHandler (DeliveryModule), resuelto vía
   * ModuleRef para no acoplar WhatsAppModule ↔ DeliveryModule. Errores: log y 200.
   */
  private async handleWabaChanges(payload: MetaWebhookPayload): Promise<void> {
    const changes = (payload.entry || []).flatMap((entry) =>
      (entry.changes || [])
        .filter((change) => isWabaWebhookField(change.field))
        .map((change) => ({ entryId: entry.id, change })),
    );
    if (changes.length === 0) return;

    let handler: TemplateWebhookHandler;
    try {
      handler = this.moduleRef.get(TemplateWebhookHandler, { strict: false });
    } catch {
      this.logger.debug('TemplateWebhookHandler not registered; WABA changes ignored');
      return;
    }

    for (const { entryId, change } of changes) {
      try {
        await handler.handle(entryId, change.field, change.value as unknown as WabaWebhookValue);
      } catch (error) {
        this.logger.error(`WABA webhook ${change.field} failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * POST /webhooks/whatsapp/inbound - Legacy endpoint (deprecated)
   *
   * @deprecated Use POST /webhooks/whatsapp with Meta payload format
   */
  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInbound(@Body() dto: InboundMessageDto): Promise<InboundMessageResponseDto> {
    const maskedPhone = maskPhone(dto.from, 'long');
    this.logger.log(
      `[LEGACY] Inbound webhook received: message_id=${dto.message_id}, from=${maskedPhone}`,
    );

    // P1-3 Fix: Legacy endpoint now requires receiver_phone_id (no 'default' fallback)
    if (!dto.receiver_phone_id) {
      this.logger.error(
        '[LEGACY] receiver_phone_id is required for multi-channel support. ' +
          'Update webhook sender to include phone_number_id.',
      );
      throw new ForbiddenException(
        'receiver_phone_id is required. This endpoint requires multi-channel support.',
      );
    }

    try {
      // Process and dedupe inbound message
      await this.whatsappService.processInboundMessage(dto);

      // Orchestrate + Send (legacy behavior: errors propagate)
      const result = await this.orchestrator.process({
        messageId: dto.message_id,
        from: dto.from,
        receiverPhoneId: dto.receiver_phone_id,
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
          conversationId: result.conversationId, // PR-03.10
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
   * PR-03.11 REQ-07: Multi-channel routing + unknown channel handling (AC-08)
   */
  private async processMessage(dto: InboundMessageDto): Promise<void> {
    const maskedPhone = maskPhone(dto.from, 'long');
    this.logger.log(`Processing message: id=${dto.message_id}, from=${maskedPhone}`);

    // PR-03.11: Resolve merchant+channel before processing
    // P1-3 Fix: receiver_phone_id is now required (no 'default' fallback)
    if (!dto.receiver_phone_id) {
      this.logger.warn(
        'Meta webhook missing phone_number_id in metadata. Skipping message processing.',
      );
      return;
    }
    const phoneNumberId = dto.receiver_phone_id;
    const resolution = await this.merchantResolver.resolveByChannel(
      ChannelType.WHATSAPP,
      phoneNumberId,
    );

    // AC-08: Unknown channel → log warning + return 200 without crash
    if (!resolution) {
      this.logger.warn(
        `Unknown channel for phone_number_id=${phoneNumberId}, returning 200 OK without processing`,
      );
      return;
    }

    this.logger.debug(
      `Channel resolved: merchantId=${resolution.merchant.id}, channelId=${resolution.channel.id}`,
    );

    try {
      // 1. Process and dedupe inbound message
      await this.whatsappService.processInboundMessage(dto);

      // 2-3. Orchestrate + Send (best-effort, never block 200 after persistence)
      try {
        const result = await this.orchestrator.process({
          messageId: dto.message_id,
          from: dto.from,
          receiverPhoneId: phoneNumberId, // Keep for backwards compat
          merchantId: resolution.merchant.id, // PR-03.11
          channelId: resolution.channel.id, // PR-03.11
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
            conversationId: result.conversationId, // PR-03.10
            channelId: resolution.channel.id, // PR-03.11 AC-12
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
}
