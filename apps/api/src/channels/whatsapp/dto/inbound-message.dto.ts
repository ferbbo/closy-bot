import { IsString, IsNotEmpty, IsOptional, IsDateString, IsIn } from 'class-validator';

/**
 * DTO for incoming WhatsApp webhook messages
 * Validates the normalized payload structure
 */
export class InboundMessageDto {
  @IsString()
  @IsNotEmpty()
  message_id!: string;

  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsOptional()
  receiver_phone_id?: string; // WhatsApp phone number ID (for merchant resolution)

  @IsDateString()
  timestamp!: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  @IsIn(['image', 'document', 'audio', 'video'])
  media_type?: string;

  @IsString()
  @IsOptional()
  media_url?: string;

  // Delivery S5.0-T1: id de media de Graph API (MediaFetcher lo descarga en el turno, RN-24).
  @IsString()
  @IsOptional()
  media_id?: string;

  @IsString()
  @IsOptional()
  mime_type?: string;

  @IsString()
  @IsOptional()
  caption?: string;
}

/**
 * Response DTO for webhook processing
 */
export class InboundMessageResponseDto {
  processed!: boolean;
  duplicate?: boolean;
}
