import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
}

/**
 * Delivery (S1.4): mensaje de plantilla (Cloud API `type: template`) con parámetros nombrados
 * (`parameter_format: named`). Los valores ya vienen saneados (sin `\n`) desde BusinessMessenger.
 */
export interface WhatsAppTemplateMessage {
  name: string;
  languageCode: string;
  params: Record<string, string>;
}

/**
 * WhatsApp Outbound Service
 * Sends messages via WhatsApp Cloud API
 * PR-03.11: Added support for dynamic credentials per channel
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
    // Delivery S1.5: with WHATSAPP_SANDBOX=true (fake Graph API) tests really send over HTTP
    const sandbox = String(this.configService.get('WHATSAPP_SANDBOX') ?? 'false') === 'true';
    this.dryRun = this.configService.get<string>('NODE_ENV') === 'test' && !sandbox;

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(
        'WhatsApp credentials not configured. Outbound messages will be logged but not sent.',
      );
    }
  }

  /**
   * Send a text message via WhatsApp Cloud API
   * Legacy method using env var credentials
   *
   * @param to - Recipient phone number (international format, e.g., +573001234567)
   * @param text - Message text content
   * @returns SendMessageResult with success status and message ID
   * @deprecated Use sendTextMessageWithCredentials() for multi-channel support
   */
  async sendTextMessage(to: string, text: string): Promise<SendMessageResult> {
    this.logger.debug('Using legacy sendTextMessage with env var credentials');

    return this.sendTextMessageWithCredentials(to, text, {
      accessToken: this.accessToken,
      phoneNumberId: this.phoneNumberId,
    });
  }

  /**
   * Send a text message via WhatsApp Cloud API with explicit credentials
   * PR-03.11: Primary method for multi-channel support (AC-05)
   *
   * @param to - Recipient phone number (international format, e.g., +573001234567)
   * @param text - Message text content
   * @param credentials - WhatsApp credentials (accessToken, phoneNumberId)
   * @returns SendMessageResult with success status and message ID
   */
  async sendTextMessageWithCredentials(
    to: string,
    text: string,
    credentials: WhatsAppCredentials,
  ): Promise<SendMessageResult> {
    // Sanitize phone number (remove + and spaces)
    const sanitizedTo = to.replace(/[+\s]/g, '');
    const maskedTo = this.maskPhone(sanitizedTo);
    const maskedPhoneNumberId = this.maskPhone(credentials.phoneNumberId);

    this.logger.log(
      `Sending text message to ${maskedTo} via phone ${maskedPhoneNumberId} (${text.length} chars)`,
    );

    // Dry run mode for tests
    if (this.dryRun || !credentials.accessToken || !credentials.phoneNumberId) {
      this.logger.debug('[DRY RUN] Message not sent (test mode or missing credentials)');
      return {
        success: true,
        messageId: `dry-run-${Date.now()}`,
      };
    }

    try {
      const url = `${this.apiUrl}/${this.apiVersion}/${credentials.phoneNumberId}/messages`;
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
          Authorization: `Bearer ${credentials.accessToken}`,
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

      const data = (await response.json()) as { messages?: Array<{ id: string }> };
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
   * Delivery (S1.4): construye el payload Cloud API de una plantilla con parámetros nombrados.
   * Público para poder verificar la forma exacta en tests (el envío real está en dry-run en test).
   */
  buildTemplatePayload(to: string, template: WhatsAppTemplateMessage): Record<string, unknown> {
    const parameters = Object.entries(template.params).map(([name, text]) => ({
      type: 'text',
      parameter_name: name,
      text,
    }));
    return {
      messaging_product: 'whatsapp',
      to: to.replace(/[+\s]/g, ''),
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.languageCode },
        components: parameters.length > 0 ? [{ type: 'body', parameters }] : [],
      },
    };
  }

  /** Delivery (S1.4): envía una plantilla con las credenciales de env (fallback sin canal). */
  async sendTemplateMessage(
    to: string,
    template: WhatsAppTemplateMessage,
  ): Promise<SendMessageResult> {
    return this.sendTemplateMessageWithCredentials(to, template, {
      accessToken: this.accessToken,
      phoneNumberId: this.phoneNumberId,
    });
  }

  /** Delivery (S1.4): envía una plantilla con credenciales explícitas del canal. */
  async sendTemplateMessageWithCredentials(
    to: string,
    template: WhatsAppTemplateMessage,
    credentials: WhatsAppCredentials,
  ): Promise<SendMessageResult> {
    const payload = this.buildTemplatePayload(to, template);
    this.logger.log(
      `Sending template ${template.name}/${template.languageCode} to ${this.maskPhone(String(payload.to))} via phone ${this.maskPhone(credentials.phoneNumberId)}`,
    );

    if (this.dryRun || !credentials.accessToken || !credentials.phoneNumberId) {
      this.logger.debug('[DRY RUN] Template not sent (test mode or missing credentials)');
      return { success: true, messageId: `dry-run-${Date.now()}` };
    }

    try {
      const url = `${this.apiUrl}/${this.apiVersion}/${credentials.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `WhatsApp API error (template): ${response.status} ${response.statusText}`,
          errorBody.substring(0, 200),
        );
        return { success: false, error: `API error: ${response.status} ${response.statusText}` };
      }

      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      this.logger.error('Failed to send WhatsApp template', error);
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
