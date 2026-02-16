import { Type } from 'class-transformer';
import { IsString, IsArray, IsOptional, ValidateNested, IsIn, IsNotEmpty } from 'class-validator';

/**
 * Meta WhatsApp Cloud API webhook payload structure
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

export class MetaMessageText {
  @IsString()
  body: string;
}

export class MetaMessageMedia {
  @IsString()
  id: string;

  @IsString()
  @IsOptional()
  mime_type?: string;

  @IsString()
  @IsOptional()
  sha256?: string;
}

export class MetaMessage {
  @IsString()
  from: string;

  @IsString()
  id: string;

  @IsString()
  timestamp: string; // Unix epoch string

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
  type: string;

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
  id: string;

  @IsString()
  @IsIn(['sent', 'delivered', 'read', 'failed'])
  status: string;

  @IsString()
  timestamp: string;

  @IsString()
  recipient_id: string;
}

export class MetaContact {
  @IsString()
  wa_id: string;

  @ValidateNested()
  @IsOptional()
  profile?: {
    name: string;
  };
}

export class MetaMetadata {
  @IsString()
  display_phone_number: string;

  @IsString()
  phone_number_id: string;
}

export class MetaValue {
  @IsString()
  messaging_product: string;

  @ValidateNested()
  @Type(() => MetaMetadata)
  metadata: MetaMetadata;

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
}

export class MetaChange {
  @ValidateNested()
  @Type(() => MetaValue)
  value: MetaValue;

  @IsString()
  field: string;
}

export class MetaEntry {
  @IsString()
  id: string;

  @ValidateNested()
  @Type(() => MetaChange)
  @IsArray()
  changes: MetaChange[];
}

export class MetaWebhookPayload {
  @IsString()
  object: string;

  @ValidateNested()
  @Type(() => MetaEntry)
  @IsArray()
  entry: MetaEntry[];
}

/**
 * Query params for Meta webhook verification
 */
export class MetaWebhookVerifyQuery {
  @IsString()
  @IsNotEmpty()
  'hub.mode': string;

  @IsString()
  @IsNotEmpty()
  'hub.verify_token': string;

  @IsString()
  @IsNotEmpty()
  'hub.challenge': string;
}
