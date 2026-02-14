import { IsString, IsNotEmpty, IsOptional, IsDateString, IsIn } from 'class-validator';

/**
 * DTO for incoming WhatsApp webhook messages
 * Validates the normalized payload structure
 */
export class InboundMessageDto {
  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsOptional()
  receiver_phone_id?: string; // WhatsApp phone number ID (for merchant resolution)

  @IsDateString()
  timestamp: string;

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
}

/**
 * Response DTO for webhook processing
 */
export class InboundMessageResponseDto {
  processed: boolean;
  duplicate?: boolean;
}
