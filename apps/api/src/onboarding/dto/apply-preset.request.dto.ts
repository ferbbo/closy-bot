/**
 * PR-OB-01: Apply Preset Request DTO
 * AC-04, AC-05
 */
import { IsEnum } from 'class-validator';

export type IndustryType = 'ropa' | 'belleza' | 'minimarket';

export class ApplyPresetRequestDto {
  @IsEnum(['ropa', 'belleza', 'minimarket'], {
    message: 'industry must be one of: ropa, belleza, minimarket',
  })
  industry!: IndustryType;
}
