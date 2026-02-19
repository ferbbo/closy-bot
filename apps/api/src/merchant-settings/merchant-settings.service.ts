import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PlaybookService } from '../services/playbook.service';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { UpdatePlaybookConfigDto } from './dto/update-playbook-config.dto';
import { MerchantProfileResponseDto } from './dto/merchant-profile-response.dto';
import { PlaybookConfig } from '../domain/entities/playbook-config.interface';

/**
 * MerchantSettingsService
 * Handles merchant profile and playbookConfig CRUD operations
 */
@Injectable()
export class MerchantSettingsService {
  private readonly logger = new Logger(MerchantSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * Get merchant profile with current playbookConfig
   */
  async getProfile(merchantId: string): Promise<MerchantProfileResponseDto> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        name: true,
        industry: true,
        playbookConfig: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found`);
    }

    return {
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry,
      playbookConfig: merchant.playbookConfig as PlaybookConfig | null,
    };
  }

  /**
   * Update merchant profile (name, industry)
   */
  async updateProfile(
    merchantId: string,
    updateDto: UpdateMerchantDto,
  ): Promise<MerchantProfileResponseDto> {
    this.logger.log(`Updating profile for merchant ${merchantId}`);

    const merchant = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(updateDto.name !== undefined && { name: updateDto.name }),
        ...(updateDto.industry !== undefined && { industry: updateDto.industry }),
      },
      select: {
        id: true,
        name: true,
        industry: true,
        playbookConfig: true,
      },
    });

    return {
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry,
      playbookConfig: merchant.playbookConfig as PlaybookConfig | null,
    };
  }

  /**
   * Replace entire playbookConfig (PUT)
   */
  async replacePlaybookConfig(
    merchantId: string,
    config: UpdatePlaybookConfigDto,
  ): Promise<MerchantProfileResponseDto> {
    this.logger.log(`Replacing playbookConfig for merchant ${merchantId}`);

    // Validate structure (throws BadRequestException if invalid)
    this.playbookService.validatePlaybookConfig(config, true);

    const merchant = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        playbookConfig: config as unknown as Record<string, unknown>,
      },
      select: {
        id: true,
        name: true,
        industry: true,
        playbookConfig: true,
      },
    });

    return {
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry,
      playbookConfig: merchant.playbookConfig as PlaybookConfig | null,
    };
  }

  /**
   * Merge partial playbookConfig (PATCH)
   */
  async mergePlaybookConfig(
    merchantId: string,
    partialConfig: UpdatePlaybookConfigDto,
  ): Promise<MerchantProfileResponseDto> {
    this.logger.log(`Merging playbookConfig for merchant ${merchantId}`);

    // Get current merchant
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found`);
    }

    // Get current playbook (with industry defaults if no custom config)
    const currentPlaybook = this.playbookService.getPlaybookForMerchant(merchant);

    // Merge with partial config
    const merged = this.playbookService.mergePlaybookConfig(currentPlaybook, partialConfig);

    // Validate merged result (requireComplete=false allows partial structures)
    this.playbookService.validatePlaybookConfig(merged, false);

    // Save merged config
    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        playbookConfig: merged as unknown as Record<string, unknown>,
      },
      select: {
        id: true,
        name: true,
        industry: true,
        playbookConfig: true,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      industry: updated.industry,
      playbookConfig: updated.playbookConfig as PlaybookConfig | null,
    };
  }
}
