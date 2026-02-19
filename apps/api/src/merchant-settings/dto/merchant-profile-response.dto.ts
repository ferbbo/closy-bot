import { Industry } from '@prisma/client';
import { PlaybookConfig } from '../../domain/entities/playbook-config.interface';

/**
 * Response DTO for merchant profile
 * Used by GET /merchants/me
 */
export class MerchantProfileResponseDto {
  id!: string;
  name!: string;
  industry!: Industry | null;
  playbookConfig!: PlaybookConfig | null;
}
