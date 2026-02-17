import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * WhatsApp Outbound Service
 * Sends messages via WhatsApp Cloud API
 */
@Injectable()
export class WhatsAppOutboundService {
  private readonly logger = new Logger(WhatsAppOutboundService.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly apiUrl: string;
  private readonly dryRun: boolean;

  constructor(private readonly configService: ConfigService) {
    this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v18.0');
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.dryRun = this.configService.get<string>('NODE_ENV') === 'test';

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(
        'WhatsApp credentials not configured. Outbound messages will be logged but not sent.',
      );
    }
  }

  /**
   * Send a text message via WhatsApp Cloud API
   *
   * @param to - Recipient phone number (international format, e.g., +573001234567)
   * @param text - Message text content
   * @returns SendMessageResult with success status and message ID
   */
  async sendTextMessage(to: string, text: string): Promise<SendMessageResult> {
    // Sanitize phone number (remove + and spaces)
    const sanitizedTo = to.replace(/[+\s]/g, '');
    const maskedTo = this.maskPhone(sanitizedTo);

    this.logger.log(`Sending text message to ${maskedTo} (${text.length} chars)`);

    // Dry run mode for tests
    if (this.dryRun || !this.accessToken || !this.phoneNumberId) {
      this.logger.debug('[DRY RUN] Message not sent (test mode or missing credentials)');
      return {
        success: true,
        messageId: `dry-run-${Date.now()}`,
      };
    }

    try {
      const url = `${this.apiUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        to: sanitizedTo,
        type: 'text',
        text: {
          body: text,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        // Truncate error body to prevent token leaks in logs
        const sanitizedError = errorBody.substring(0, 200);
        this.logger.error(
          `WhatsApp API error: ${response.status} ${response.statusText}`,
          sanitizedError,
        );

        return {
          success: false,
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = await response.json();
      const messageId = data.messages?.[0]?.id;

      this.logger.log(`Message sent successfully: ${messageId}`);

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      this.logger.error('Failed to send WhatsApp message', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Mask phone number for PII protection in logs
   * Example: 573001234567 -> 57300****567
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '****';
    return phone.slice(0, 5) + '****' + phone.slice(-3);
  }
}
