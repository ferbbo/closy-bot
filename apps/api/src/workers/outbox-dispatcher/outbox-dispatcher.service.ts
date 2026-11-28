import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxRepository } from '../../persistence/repositories/outbox.repository';
import { ChannelRepository } from '../../persistence/repositories/channel.repository'; // PR-03.11
import {
  SendMessageResult,
  WhatsAppCredentials,
  WhatsAppImageMessage,
  WhatsAppInteractiveButtons,
  WhatsAppOutboundService,
  WhatsAppTemplateMessage,
} from '../../channels/whatsapp/whatsapp-outbound.service';
import { OutboxMessage, OutboxMessageType, MessageDirection } from '@prisma/client';
import { maskPhone } from '../../common/utils/pii.util';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository'; // PR-03.10

/**
 * Dispatcher service for processing outbox messages
 * Runs periodically to claim and send pending/failed messages
 * PR-03.11: Uses channel-specific credentials when available (AC-07)
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly lockId: string;
  private readonly batchSize: number;
  private readonly lockTtlSeconds: number;
  private readonly maxAttempts: number;
  private readonly enabled: boolean;
  private isProcessing = false;

  constructor(
    private readonly outboxRepo: OutboxRepository,
    private readonly channelRepo: ChannelRepository, // PR-03.11
    private readonly whatsappOutbound: WhatsAppOutboundService,
    private readonly configService: ConfigService,
    private readonly messageLogRepository: MessageLogRepository, // PR-03.10
  ) {
    this.lockId = `dispatcher-${process.pid}-${Date.now()}`;
    this.batchSize = Number(this.configService.get<number>('OUTBOX_BATCH_SIZE', 10));
    this.lockTtlSeconds = Number(this.configService.get<number>('OUTBOX_LOCK_TTL_SECONDS', 300));
    this.maxAttempts = Number(this.configService.get<number>('OUTBOX_MAX_ATTEMPTS', 5));
    this.enabled = this.configService.get<string>('OUTBOX_DISPATCHER_ENABLED', 'true') === 'true';
  }

  onModuleInit() {
    if (this.enabled) {
      this.logger.log(
        `OutboxDispatcher initialized: lockId=${this.lockId}, batchSize=${this.batchSize}, maxAttempts=${this.maxAttempts}`,
      );
    } else {
      this.logger.warn('OutboxDispatcher is DISABLED via OUTBOX_DISPATCHER_ENABLED=false');
    }
  }

  /**
   * Process outbox messages every 10 seconds
   * Uses cron to prevent concurrent executions
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    if (!this.enabled) {
      return;
    }

    if (this.isProcessing) {
      this.logger.debug('Already processing, skipping this cycle');
      return;
    }

    this.isProcessing = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error('Error in processOutbox:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single batch of messages
   */
  private async processBatch() {
    const messages = await this.outboxRepo.claimBatch(
      this.batchSize,
      this.lockId,
      this.lockTtlSeconds,
      this.maxAttempts,
    );

    if (messages.length === 0) {
      this.logger.debug('No pending messages to process');
      return;
    }

    this.logger.log(`Processing ${messages.length} message(s)`);

    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(message: OutboxMessage) {
    const maskedTo = maskPhone(message.to);
    this.logger.debug(
      `Processing message id=${message.id}, type=${message.type}, to=${maskedTo}, attempt=${message.attempts + 1}`,
    );

    try {
      // Dispatch based on type
      switch (message.type) {
        case OutboxMessageType.SEND_TEXT:
          await this.sendTextMessage(message);
          break;
        case OutboxMessageType.SEND_TEMPLATE:
          await this.sendTemplateMessage(message);
          break;
        case OutboxMessageType.SEND_INTERACTIVE:
          await this.sendInteractiveMessage(message);
          break;
        case OutboxMessageType.SEND_IMAGE:
          await this.sendImageMessage(message);
          break;
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      await this.handleError(message, error);
    }
  }

  /**
   * Send a text message via WhatsApp
   */
  /**
   * PR-03.11 REQ-06 AC-07: Uses channel credentials when available, fallback to env vars
   */
  private async sendTextMessage(message: OutboxMessage) {
    const payload = message.payloadJson as {
      text: string;
      replyToMessageId?: string;
      metadata?: Record<string, unknown>;
    };

    let result: { success: boolean; messageId?: string; error?: string };

    // PR-03.11: Use channel credentials if channelId present, else fallback to env vars
    if (message.channelId) {
      const channel = await this.channelRepo.findById(message.channelId);
      if (!channel) {
        // This should not happen in production, but handle defensively
        this.logger.warn(
          `Channel not found for channelId=${message.channelId}, falling back to env vars`,
        );
        result = await this.whatsappOutbound.sendTextMessage(message.to, payload.text);
      } else {
        // Use channel-specific credentials (AC-07)
        const credentials = channel.credentials as {
          businessAccountId: string;
          phoneNumberId: string;
          accessToken: string;
        };
        result = await this.whatsappOutbound.sendTextMessageWithCredentials(
          message.to,
          payload.text,
          credentials,
        );
      }
    } else {
      // Backwards compatibility: no channelId -> use env vars (AC-07)
      result = await this.whatsappOutbound.sendTextMessage(message.to, payload.text);
    }

    if (!result.success) {
      throw new Error(result.error ?? 'Unknown error from WhatsApp API');
    }

    // Mark as sent
    await this.outboxRepo.markSent(message.id, result.messageId ?? 'unknown');
    this.logger.log(
      `Message sent successfully: id=${message.id}, providerMessageId=${result.messageId}`,
    );

    // PR-03.10: Log outbound message (REQ-01, AC-02, REQ-07)
    if (message.conversationId) {
      try {
        const messageHistoryDays = this.configService.get<number>('MESSAGE_HISTORY_DAYS', 30);
        const expiresAt = new Date(Date.now() + messageHistoryDays * 24 * 60 * 60 * 1000);

        await this.messageLogRepository.create({
          conversationId: message.conversationId,
          merchantId: message.merchantId,
          direction: MessageDirection.OUT,
          providerMessageId: result.messageId,
          text: payload.text,
          expiresAt,
        });
      } catch (error) {
        // Don't fail outbound if logging fails
        this.logger.warn(
          `Failed to log outbound message for conversation ${message.conversationId}`,
          error,
        );
      }
    }
  }

  /**
   * Delivery (S1.4): envía una plantilla (`SEND_TEMPLATE`). Misma resolución de credenciales
   * que SEND_TEXT (canal si existe, si no env vars). El MessageLog guarda el cuerpo renderizado
   * (o `[plantilla:<name>]`) para la memoria de la conversación.
   */
  private async sendTemplateMessage(message: OutboxMessage) {
    const payload = message.payloadJson as unknown as {
      template: WhatsAppTemplateMessage;
      renderedText?: string;
    };
    if (!payload?.template?.name || !payload.template.languageCode) {
      throw new Error('Invalid SEND_TEMPLATE payload: missing template name or language');
    }
    const template: WhatsAppTemplateMessage = {
      name: payload.template.name,
      languageCode: payload.template.languageCode,
      params: payload.template.params ?? {},
    };

    const channel = message.channelId ? await this.channelRepo.findById(message.channelId) : null;
    const result = channel
      ? await this.whatsappOutbound.sendTemplateMessageWithCredentials(
          message.to,
          template,
          channel.credentials as { accessToken: string; phoneNumberId: string },
        )
      : await this.whatsappOutbound.sendTemplateMessage(message.to, template);

    if (!result.success) {
      throw new Error(result.error ?? 'Unknown error from WhatsApp API');
    }

    await this.outboxRepo.markSent(message.id, result.messageId ?? 'unknown');
    this.logger.log(
      `Template sent: id=${message.id}, template=${template.name}, providerMessageId=${result.messageId}`,
    );

    if (message.conversationId) {
      try {
        const days = Number(this.configService.get<number>('MESSAGE_HISTORY_DAYS', 30));
        await this.messageLogRepository.create({
          conversationId: message.conversationId,
          merchantId: message.merchantId,
          direction: MessageDirection.OUT,
          providerMessageId: result.messageId,
          text: payload.renderedText ?? `[plantilla:${template.name}]`,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        });
      } catch (error) {
        this.logger.warn(
          `Failed to log outbound template for conversation ${message.conversationId}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Delivery (S5.4): envía un mensaje interactivo con botones (`SEND_INTERACTIVE`). Misma
   * resolución de credenciales que SEND_TEMPLATE; el MessageLog guarda el `body`.
   */
  private async sendInteractiveMessage(message: OutboxMessage) {
    const payload = message.payloadJson as unknown as {
      interactive?: WhatsAppInteractiveButtons;
    };
    const interactive = payload?.interactive;
    if (!interactive?.body || !Array.isArray(interactive.buttons) || !interactive.buttons.length) {
      throw new Error('Invalid SEND_INTERACTIVE payload: missing body or buttons');
    }
    const msg: WhatsAppInteractiveButtons = {
      body: interactive.body,
      buttons: interactive.buttons,
    };
    const result = await this.sendWithChannel(
      message,
      () => this.whatsappOutbound.sendInteractiveMessage(message.to, msg),
      (credentials) =>
        this.whatsappOutbound.sendInteractiveMessageWithCredentials(message.to, msg, credentials),
    );
    await this.completeSend(message, result, msg.body, 'Interactive');
  }

  /** Delivery (S5.4): envía una imagen por link (`SEND_IMAGE`); el MessageLog guarda un marcador. */
  private async sendImageMessage(message: OutboxMessage) {
    const payload = message.payloadJson as unknown as { image?: WhatsAppImageMessage };
    const link = payload?.image?.link;
    if (!link) {
      throw new Error('Invalid SEND_IMAGE payload: missing link');
    }
    const msg: WhatsAppImageMessage = { link, caption: payload.image?.caption };
    const result = await this.sendWithChannel(
      message,
      () => this.whatsappOutbound.sendImageMessage(message.to, msg),
      (credentials) =>
        this.whatsappOutbound.sendImageMessageWithCredentials(message.to, msg, credentials),
    );
    await this.completeSend(
      message,
      result,
      `[imagen]${msg.caption ? ` ${msg.caption}` : ''}`,
      'Image',
    );
  }

  /** Delivery (S5.4): credenciales del canal si existe; si no, env vars (como SEND_TEMPLATE). */
  private async sendWithChannel(
    message: OutboxMessage,
    withEnv: () => Promise<SendMessageResult>,
    withCredentials: (credentials: WhatsAppCredentials) => Promise<SendMessageResult>,
  ): Promise<SendMessageResult> {
    const channel = message.channelId ? await this.channelRepo.findById(message.channelId) : null;
    return channel
      ? withCredentials(channel.credentials as unknown as WhatsAppCredentials)
      : withEnv();
  }

  /** Delivery (S5.4): marca enviado y registra el texto saliente en MessageLog (best-effort). */
  private async completeSend(
    message: OutboxMessage,
    result: SendMessageResult,
    logText: string,
    kind: string,
  ) {
    if (!result.success) {
      throw new Error(result.error ?? 'Unknown error from WhatsApp API');
    }
    await this.outboxRepo.markSent(message.id, result.messageId ?? 'unknown');
    this.logger.log(`${kind} sent: id=${message.id}, providerMessageId=${result.messageId}`);
    if (!message.conversationId) return;
    try {
      const days = Number(this.configService.get<number>('MESSAGE_HISTORY_DAYS', 30));
      await this.messageLogRepository.create({
        conversationId: message.conversationId,
        merchantId: message.merchantId,
        direction: MessageDirection.OUT,
        providerMessageId: result.messageId,
        text: logText,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log outbound ${kind} for conversation ${message.conversationId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle errors during processing
   */
  private async handleError(message: OutboxMessage, error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const maskedTo = maskPhone(message.to);

    this.logger.error(
      `Failed to process message id=${message.id}, to=${maskedTo}: ${errorMessage}`,
    );

    // Mark as failed and schedule retry
    await this.outboxRepo.markFailed(message.id, errorMessage, this.maxAttempts);
  }
}
