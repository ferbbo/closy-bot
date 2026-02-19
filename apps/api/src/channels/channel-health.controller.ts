import { Controller, Get, Post, Param, UseGuards, Req, Logger, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ChannelOwnershipGuard } from './guards/channel-ownership.guard';
import { ChannelHealthService } from './channel-health.service';
import { ConfigService } from '@nestjs/config';
import {
  ChannelHealthDto,
  RetryWebhookResponseDto,
  RefreshStatusResponseDto,
} from './dto/channel-health.dto';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';

/**
 * Channel Health Controller
 * Provides health diagnostics and recovery operations for channels
 * REQ-03, REQ-05, REQ-07, REQ-08, REQ-09
 */
@Controller('channels')
@UseGuards(SessionAuthGuard) // All endpoints require authentication
export class ChannelHealthController {
  private readonly logger = new Logger(ChannelHealthController.name);
  private readonly rateLimitTtl: number;
  private readonly rateLimitMax: number;

  constructor(
    private readonly channelHealthService: ChannelHealthService,
    private readonly configService: ConfigService,
  ) {
    // REQ-09: Rate limit from env vars (defaults: 5 req/min)
    this.rateLimitTtl = this.configService.get<number>('CHANNEL_HEALTH_RATE_LIMIT_TTL', 60000);
    this.rateLimitMax = this.configService.get<number>('CHANNEL_HEALTH_RATE_LIMIT_MAX', 5);
  }

  /**
   * Get channel health diagnostics
   * GET /channels/:id/health
   * REQ-03: AC-04, AC-05
   */
  @Get(':id/health')
  @UseGuards(ChannelOwnershipGuard)
  async getHealth(
    @Param('id') channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChannelHealthDto> {
    this.logger.log(`Health check for channel ${channelId} by merchant ${req.merchant.id}`);
    return this.channelHealthService.getHealth(channelId, req.merchant.id);
  }

  /**
   * Retry webhook subscription
   * POST /channels/:id/retry-webhook
   * REQ-05: AC-08, AC-09
   * Rate limited: 5 requests per minute per merchant
   */
  @Post(':id/retry-webhook')
  @HttpCode(200) // Return 200 instead of default 201 for POST
  @UseGuards(ChannelOwnershipGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Note: @Throttle decorator values are static, using global config
  async retryWebhook(
    @Param('id') channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RetryWebhookResponseDto> {
    this.logger.log(`Retrying webhook for channel ${channelId} by merchant ${req.merchant.id}`);
    return this.channelHealthService.retryWebhookSubscription(channelId, req.merchant.id);
  }

  /**
   * Refresh channel status from Meta API
   * POST /channels/:id/refresh-status
   * REQ-07: AC-11
   * Rate limited: 5 requests per minute per merchant
   */
  @Post(':id/refresh-status')
  @HttpCode(200) // Return 200 instead of default 201 for POST
  @UseGuards(ChannelOwnershipGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Note: @Throttle decorator values are static, using global config
  async refreshStatus(
    @Param('id') channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RefreshStatusResponseDto> {
    this.logger.log(`Refreshing status for channel ${channelId} by merchant ${req.merchant.id}`);
    return this.channelHealthService.refreshChannelStatus(channelId, req.merchant.id);
  }
}
