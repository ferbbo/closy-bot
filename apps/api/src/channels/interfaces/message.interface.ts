/**
 * Normalized message interface
 *
 * All incoming messages from any channel are normalized to this format
 */
export interface NormalizedMessage {
  /** Unique message ID from provider (for idempotency) */
  messageId: string;

  /** Channel identifier (e.g., 'whatsapp', 'instagram', 'webchat') */
  channel: string;

  /** External user ID (e.g., phone number for WhatsApp) */
  userExternalId: string;

  /** Message text content */
  text?: string;

  /** Message timestamp from provider */
  timestamp: Date;

  /** Optional attachments (images, etc.) */
  attachments?: MessageAttachment[];

  /** Raw provider data for debugging */
  rawData?: Record<string, unknown>;
}

export interface MessageAttachment {
  type: 'image' | 'document' | 'audio' | 'video';
  url: string;
  mimeType?: string;
  filename?: string;
}
