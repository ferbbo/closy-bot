import { Controller, Get, Patch, Put, Body, UseGuards, Req, Logger } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { MerchantSettingsService } from './merchant-settings.service';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { UpdatePlaybookConfigDto } from './dto/update-playbook-config.dto';
import { MerchantProfileResponseDto } from './dto/merchant-profile-response.dto';

/**
 * MerchantSettingsController
 * Endpoints for authenticated merchants to manage profile and playbookConfig
 */
@Controller('merchants')
@UseGuards(SessionAuthGuard)
export class MerchantSettingsController {
  private readonly logger = new Logger(MerchantSettingsController.name);

  constructor(private readonly merchantSettingsService: MerchantSettingsService) {}

  /**
   * GET /merchants/me
   * Get current merchant profile with playbookConfig
   */
  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest): Promise<MerchantProfileResponseDto> {
    this.logger.log(`GET /merchants/me - merchant: ${req.merchant.id}`);
    return this.merchantSettingsService.getProfile(req.merchant.id);
  }

  /**
   * PATCH /merchants/me
   * Update merchant profile (name, industry)
   */
  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateDto: UpdateMerchantDto,
  ): Promise<MerchantProfileResponseDto> {
    this.logger.log(`PATCH /merchants/me - merchant: ${req.merchant.id}`);
    return this.merchantSettingsService.updateProfile(req.merchant.id, updateDto);
  }

  /**
   * PUT /merchants/me/playbook
   * Replace entire playbookConfig
   */
  @Put('me/playbook')
  async replacePlaybookConfig(
    @Req() req: AuthenticatedRequest,
    @Body() config: UpdatePlaybookConfigDto,
  ): Promise<MerchantProfileResponseDto> {
    this.logger.log(`PUT /merchants/me/playbook - merchant: ${req.merchant.id}`);
    return this.merchantSettingsService.replacePlaybookConfig(req.merchant.id, config);
  }

  /**
   * PATCH /merchants/me/playbook
   * Merge partial playbookConfig
   */
  @Patch('me/playbook')
  async mergePlaybookConfig(
    @Req() req: AuthenticatedRequest,
    @Body() partialConfig: UpdatePlaybookConfigDto,
  ): Promise<MerchantProfileResponseDto> {
    this.logger.log(`PATCH /merchants/me/playbook - merchant: ${req.merchant.id}`);
    return this.merchantSettingsService.mergePlaybookConfig(req.merchant.id, partialConfig);
  }
}
