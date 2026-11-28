import { Logger } from '@nestjs/common';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { MetaWebhookPayload, MetaMessage } from './dto/meta-webhook.dto';

/**
 * Mapper for Meta WhatsApp Cloud API webhook payloads
 * Converts Meta's nested structure to our normalized InboundMessageDto
 *
 * Handles:
 * - Multiple entries/changes in single payload (processes each message)
 * - Text messages only (other types logged and skipped)
 * - Timestamp conversion (Unix epoch → ISO 8601)
 * - Safe extraction with defensive null checks
 */

const logger = new Logger('WhatsAppWebhookMapper');

/**
 * Extract all messages from Meta webhook payload
 * Returns array of normalized DTOs (one per message)
 *
 * @param payload - Meta webhook payload
 * @returns Array of InboundMessageDto (empty if no processable messages)
 */
export function mapMetaWebhookToInboundMessages(payload: MetaWebhookPayload): InboundMessageDto[] {
  const messages: InboundMessageDto[] = [];

  // Meta can send multiple entries
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const { value } = change;

      // Skip if this is a status update (not a message)
      if (value.statuses && value.statuses.length > 0) {
        logger.debug(`Skipping status update: ${value.statuses.length} status(es)`);
        continue;
      }

      // Process messages
      if (value.messages && value.messages.length > 0) {
        for (const metaMessage of value.messages) {
          const mapped = mapSingleMessage(metaMessage, value.metadata.phone_number_id);
          if (mapped) {
            messages.push(mapped);
          }
        }
      }
    }
  }

  return messages;
}

/**
 * Map a single Meta message to InboundMessageDto
 * Returns null if message type is not supported
 */
const MEDIA_TYPES = ['audio', 'image', 'video', 'document'] as const;
type MediaMessageType = (typeof MEDIA_TYPES)[number];

function isMediaType(type: string): type is MediaMessageType {
  return (MEDIA_TYPES as readonly string[]).includes(type);
}

function mapSingleMessage(
  metaMessage: MetaMessage,
  phoneNumberId: string,
): InboundMessageDto | null {
  const { id, from, timestamp, type } = metaMessage;

  // Convert Unix epoch to ISO 8601
  const timestampMs = parseInt(timestamp, 10) * 1000;
  const isoTimestamp = new Date(timestampMs).toISOString();

  if (type === 'text') {
    const text = metaMessage.text?.body;
    if (!text) {
      logger.warn(`Text message without body content (message_id=${id})`);
      return null;
    }
    return {
      message_id: id,
      from,
      receiver_phone_id: phoneNumberId,
      timestamp: isoTimestamp,
      text,
    };
  }

  // S5.0-T1: audio/image/video/document se propagan con sus datos de media; el
  // resto (sticker, location, contacts, button, interactive salvo button_reply) sigue sin soporte.
  if (isMediaType(type)) {
    const media = metaMessage[type];
    if (!media) {
      logger.warn(`${type} message without media payload (message_id=${id})`);
      return null;
    }
    return {
      message_id: id,
      from,
      receiver_phone_id: phoneNumberId,
      timestamp: isoTimestamp,
      media_type: type,
      media_id: media.id,
      mime_type: media.mime_type,
      caption: media.caption,
    };
  }

  // S5.4: respuesta a botón → texto = título del botón (mismo flujo que si lo escribiera).
  const reply = type === 'interactive' ? metaMessage.interactive?.button_reply : undefined;
  if (reply?.id) {
    return {
      message_id: id,
      from,
      receiver_phone_id: phoneNumberId,
      timestamp: isoTimestamp,
      text: reply.title || reply.id,
      interactive_reply_id: reply.id,
    };
  }

  logger.log(`Unsupported message type: ${type} (message_id=${id}).`);
  return null;
}

/**
 * Check if Meta webhook payload contains only status updates
 * Used to early-return 200 without processing
 */
export function isStatusOnlyPayload(payload: MetaWebhookPayload): boolean {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const { value } = change;

      // If there are any messages, it's not status-only
      if (value.messages && value.messages.length > 0) {
        return false;
      }
    }
  }

  return true;
}
