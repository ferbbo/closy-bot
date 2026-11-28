import { createHmac } from 'crypto';
import { SANDBOX_APP } from './sandbox-app';

/**
 * Meta Sandbox (S1.5-T3) — constructores de webhooks de WhatsApp Cloud API + firma.
 * Formato: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

let seq = 0;
const nextWamid = (): string => `wamid.SANDBOX_IN_${Date.now()}_${++seq}`;
const nowEpoch = (): string => Math.floor(Date.now() / 1000).toString();
const waId = (phone: string): string => phone.replace(/[^\d]/g, '');

export interface WebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{ id: string; changes: Array<{ field: string; value: Record<string, unknown> }> }>;
}

function envelope(field: string, value: Record<string, unknown>): WebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: SANDBOX_APP.wabaId, changes: [{ field, value }] }],
  };
}

function messageEnvelope(
  from: string,
  message: Record<string, unknown>,
  opts: { id?: string } = {},
): WebhookPayload {
  return envelope('messages', {
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: waId(SANDBOX_APP.merchantPhone),
      phone_number_id: SANDBOX_APP.phoneNumberId,
    },
    contacts: [{ profile: { name: 'Cliente Sandbox' }, wa_id: waId(from) }],
    messages: [{ from: waId(from), id: opts.id ?? nextWamid(), timestamp: nowEpoch(), ...message }],
  });
}

export function inboundText(
  from: string,
  text: string,
  opts: { id?: string } = {},
): WebhookPayload {
  return messageEnvelope(from, { type: 'text', text: { body: text } }, opts);
}

export function inboundAudio(
  from: string,
  mediaId: string,
  opts: { id?: string } = {},
): WebhookPayload {
  return messageEnvelope(
    from,
    { type: 'audio', audio: { id: mediaId, mime_type: 'audio/ogg; codecs=opus', voice: true } },
    opts,
  );
}

export function inboundImage(
  from: string,
  mediaId: string,
  caption?: string,
  opts: { id?: string } = {},
): WebhookPayload {
  return messageEnvelope(
    from,
    {
      type: 'image',
      image: { id: mediaId, mime_type: 'image/jpeg', ...(caption ? { caption } : {}) },
    },
    opts,
  );
}

export function buttonReply(
  from: string,
  id: string,
  title: string,
  opts: { id?: string } = {},
): WebhookPayload {
  return messageEnvelope(
    from,
    { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title } } },
    opts,
  );
}

export function templateStatusUpdate(
  name: string,
  status: string,
  language = 'es',
): WebhookPayload {
  return envelope('message_template_status_update', {
    event: status,
    message_template_id: 1000 + name.length,
    message_template_name: name,
    message_template_language: language,
    reason: status === 'REJECTED' ? 'INCORRECT_CATEGORY' : null,
  });
}

export function templateCategoryUpdate(
  name: string,
  previousCategory: string,
  newCategory: string,
  language = 'es',
): WebhookPayload {
  return envelope('template_category_update', {
    message_template_id: 1000 + name.length,
    message_template_name: name,
    message_template_language: language,
    previous_category: previousCategory,
    new_category: newCategory,
  });
}

export function phoneQualityUpdate(
  level: 'GREEN' | 'YELLOW' | 'RED' | 'FLAGGED' | 'UNKNOWN',
  event = 'DOWNGRADE',
): WebhookPayload {
  return envelope('phone_number_quality_update', {
    display_phone_number: waId(SANDBOX_APP.merchantPhone),
    event,
    current_limit: 'TIER_1K',
    current_quality_rating: level,
  });
}

/** `X-Hub-Signature-256` para un cuerpo crudo (exactamente el string que se envía). */
export function signPayload(rawBody: string, appSecret: string = SANDBOX_APP.appSecret): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
}
