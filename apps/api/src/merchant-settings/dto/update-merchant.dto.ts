import { IsString, IsOptional, MinLength, IsEnum } from 'class-validator';
import { Industry } from '@prisma/client';

/**
 * DTO for updating merchant profile (name, industry)
 * Used by PATCH /merchants/me
 */
export class UpdateMerchantDto {
  @IsString()
  @IsOptional()
  @MinLength(1, { message: 'Name must not be empty' })
  name?: string;

  @IsEnum(Industry, { message: 'Invalid industry value' })
  @IsOptional()
  industry?: Industry | null;
}
