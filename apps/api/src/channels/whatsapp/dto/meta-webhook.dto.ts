import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsIn,
  IsNotEmpty,
  ValidateIf,
  Allow,
} from 'class-validator';

/**
 * Meta WhatsApp Cloud API webhook payload structure
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

export class MetaMessageText {
  @IsString()
  body!: string;
}

export class MetaMessageMedia {
  @IsString()
  id!: string;

  @IsString()
  @IsOptional()
  mime_type?: string;

  @IsString()
  @IsOptional()
  sha256?: string;

  // Delivery S5.0-T1: image/video/document pueden traer caption (audio no).
  @IsString()
  @IsOptional()
  caption?: string;

  // Delivery S5.2: Meta marca las notas de voz con `audio.voice: true`; sin esto el
  // ValidationPipe global (forbidNonWhitelisted) responde 400 a todo audio real.
  @IsBoolean()
  @IsOptional()
  voice?: boolean;
}

export class MetaMessage {
  @IsString()
  from!: string;

  @IsString()
  id!: string;

  @IsString()
  timestamp!: string; // Unix epoch string

  @IsString()
  @IsIn([
    'text',
    'image',
    'document',
    'audio',
    'video',
    'sticker',
    'location',
    'contacts',
    'button',
    'interactive',
  ])
  type!: string;

  @ValidateNested()
  @Type(() => MetaMessageText)
  @IsOptional()
  text?: MetaMessageText;

  @ValidateNested()
  @Type(() => MetaMessageMedia)
  @IsOptional()
  image?: MetaMessageMedia;

  @ValidateNested()
  @Type(() => MetaMessageMedia)
  @IsOptional()
  document?: MetaMessageMedia;

  @ValidateNested()
  @Type(() => MetaMessageMedia)
  @IsOptional()
  audio?: MetaMessageMedia;

  @ValidateNested()
  @Type(() => MetaMessageMedia)
  @IsOptional()
  video?: MetaMessageMedia;
}

export class MetaStatus {
  @IsString()
  id!: string;

  @IsString()
  @IsIn(['sent', 'delivered', 'read', 'failed'])
  status!: string;

  @IsString()
  timestamp!: string;

  @IsString()
  recipient_id!: string;
}

export class MetaContactProfile {
  @IsString()
  @IsOptional()
  name?: string;
}

export class MetaContact {
  @IsString()
  wa_id!: string;

  @ValidateNested()
  @Type(() => MetaContactProfile)
  @IsOptional()
  profile?: MetaContactProfile;
}

export class MetaMetadata {
  @IsString()
  display_phone_number!: string;

  @IsString()
  phone_number_id!: string;
}

/**
 * Delivery S1.4-T4: los cambios de WABA (`message_template_status_update`,
 * `template_category_update`, `phone_number_quality_update`) no traen `messaging_product`
 * ni `metadata`. Esos dos campos siguen siendo obligatorios para el resto (campo `messages`).
 */
export function isWabaAccountValue(value: MetaValue): boolean {
  return (
    value.messages === undefined &&
    value.statuses === undefined &&
    value.contacts === undefined &&
    (value.message_template_name !== undefined ||
      value.new_category !== undefined ||
      value.event !== undefined ||
      value.current_limit !== undefined)
  );
}

export class MetaValue {
  @ValidateIf((o: MetaValue) => !isWabaAccountValue(o))
  @IsString()
  messaging_product!: string;

  @ValidateIf((o: MetaValue) => !isWabaAccountValue(o))
  @ValidateNested()
  @Type(() => MetaMetadata)
  metadata!: MetaMetadata;

  @ValidateNested()
  @Type(() => MetaContact)
  @IsArray()
  @IsOptional()
  contacts?: MetaContact[];

  @ValidateNested()
  @Type(() => MetaMessage)
  @IsArray()
  @IsOptional()
  messages?: MetaMessage[];

  @ValidateNested()
  @Type(() => MetaStatus)
  @IsArray()
  @IsOptional()
  statuses?: MetaStatus[];

  // ---- Delivery S1.4-T4: campos de WABA (plantillas y calidad del número) ----
  @IsOptional()
  @IsString()
  event?: string;

  @Allow()
  message_template_id?: number | string;

  @IsOptional()
  @IsString()
  message_template_name?: string;

  @IsOptional()
  @IsString()
  message_template_language?: string;

  @Allow()
  reason?: string | null;

  @Allow()
  other_info?: unknown;

  @IsOptional()
  @IsString()
  previous_category?: string;

  @IsOptional()
  @IsString()
  new_category?: string;

  @IsOptional()
  @IsString()
  correct_category?: string;

  @IsOptional()
  @IsString()
  display_phone_number?: string;

  @Allow()
  current_limit?: string;

  @Allow()
  old_limit?: string;

  @Allow()
  current_quality_rating?: string;

  @Allow()
  max_daily_conversation_per_phone?: number;
}

export class MetaChange {
  @ValidateNested()
  @Type(() => MetaValue)
  value!: MetaValue;

  @IsString()
  field!: string;
}

export class MetaEntry {
  @IsString()
  id!: string;

  /** Delivery S1.4-T4: los eventos de WABA incluyen `time` (epoch) en la entrada. */
  @Allow()
  time?: number;

  @ValidateNested()
  @Type(() => MetaChange)
  @IsArray()
  changes!: MetaChange[];
}

export class MetaWebhookPayload {
  @IsString()
  object!: string;

  @ValidateNested()
  @Type(() => MetaEntry)
  @IsArray()
  entry!: MetaEntry[];
}

/**
 * Query params for Meta webhook verification
 */
export class MetaWebhookVerifyQuery {
  @IsString()
  @IsNotEmpty()
  'hub.mode'!: string;

  @IsString()
  @IsNotEmpty()
  'hub.verify_token'!: string;

  @IsString()
  @IsNotEmpty()
  'hub.challenge'!: string;
}
