import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { MetaEmbeddedSignupProvider } from '../onboarding/providers/meta-embedded-signup.provider';
import {
  ChannelHealthDto,
  RetryWebhookResponseDto,
  RefreshStatusResponseDto,
} from './dto/channel-health.dto';
import { Channel } from '@prisma/client';

interface ChannelCredentials {
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
  appSecret?: string;
}

/**
 * Channel Health Service
 * Provides health diagnostics and recovery operations for channels
 * REQ-02, REQ-04, REQ-06
 */
@Injectable()
export class ChannelHealthService {
  private readonly logger = new Logger(ChannelHealthService.name);
  private readonly webhookUrl: string;
  private readonly webhookVerifyToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaProvider: MetaEmbeddedSignupProvider,
  ) {
    // Construct webhook URL from environment
    const redirectUri =
      process.env.META_REDIRECT_URI || 'http://localhost:3000/onboarding/whatsapp/callback';
    const baseUrl = redirectUri.replace(/\/onboarding\/whatsapp\/callback$/, '');
    this.webhookUrl = `${baseUrl}/webhooks/whatsapp`;
    this.webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default-verify-token';
  }

  /**
   * Get health diagnostics for a channel
   * REQ-02: AC-02, AC-03
   */
  async getHealth(channelId: string, merchantId: string): Promise<ChannelHealthDto> {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        merchantId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Calculate recent errors (simple: split statusReason by newlines, take last 3)
    const recentErrors: string[] = [];
    if (channel.statusReason) {
      const errorLines = channel.statusReason.split('\n').filter((line) => line.trim());
      recentErrors.push(...errorLines.slice(-3));
    }

    const recommendation = this.getRecommendation(channel);

    return {
      channelId: channel.id,
      status: channel.status,
      webhookSubscribed: channel.webhookSubscribed,
      lastWebhookAt: channel.lastWebhookAt?.toISOString() || null,
      recentErrors,
      errorCount: channel.errorCount,
      lastErrorAt: channel.lastErrorAt?.toISOString() || null,
      recommendation,
    };
  }

  /**
   * Recommendation logic based on channel state
   * REQ-02: AC-03
   */
  private getRecommendation(
    channel: Channel,
  ): 'resubscribe_webhook' | 'refresh_credentials' | 'check_permissions' | null {
    if (channel.status === 'pending') {
      return null; // Still onboarding
    }

    if (!channel.webhookSubscribed) {
      return 'resubscribe_webhook';
    }

    if (channel.status === 'error') {
      const reason = channel.statusReason?.toLowerCase() || '';
      if (reason.includes('token') || reason.includes('credential')) {
        return 'refresh_credentials';
      }
      if (reason.includes('permission')) {
        return 'check_permissions';
      }
      return 'refresh_credentials'; // default
    }

    if (channel.errorCount > 5) {
      return 'check_permissions';
    }

    return null; // Healthy
  }

  /**
   * Retry webhook subscription with exponential backoff
   * REQ-04: AC-06, AC-07
   */
  async retryWebhookSubscription(
    channelId: string,
    merchantId: string,
  ): Promise<RetryWebhookResponseDto> {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        merchantId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (!channel.wabaId) {
      throw new BadRequestException('Channel has no WABA ID');
    }

    const credentials = channel.credentials as ChannelCredentials;
    if (!credentials.accessToken) {
      throw new BadRequestException('Channel has no access token');
    }

    this.logger.log(`Retrying webhook subscription for channel: ${channelId}`);

    // Exponential backoff: 1s, 2s, 4s (max 3 attempts)
    const delays = [1000, 2000, 4000];
    let lastError = '';

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await this.metaProvider.subscribeWebhook(
          channel.wabaId,
          credentials.accessToken,
          this.webhookUrl,
          this.webhookVerifyToken,
        );

        if (result.success) {
          // Success: update status
          await this.prisma.channel.update({
            where: { id: channelId },
            data: {
              status: 'connected',
              statusReason: null,
              webhookSubscribed: true,
              lastWebhookAt: new Date(),
              errorCount: 0,
              lastErrorAt: null,
            },
          });

          this.logger.log(
            `Webhook subscription successful for channel: ${channelId} (attempt ${attempt + 1})`,
          );
          return {
            success: true,
            message: 'Webhook subscription successful',
          };
        } else {
          lastError = result.error || 'Unknown error';
          this.logger.warn(
            `Webhook subscription attempt ${attempt + 1} failed for channel ${channelId}: ${lastError}`,
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Webhook subscription attempt ${attempt + 1} threw error for channel ${channelId}: ${lastError}`,
        );
      }

      // Wait before retry (except on last attempt)
      if (attempt < 2) {
        await this.sleep(delays[attempt]);
      }
    }

    // All attempts failed
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        errorCount: { increment: 1 },
        lastErrorAt: new Date(),
        statusReason: `Webhook subscription failed after 3 attempts: ${lastError}`,
      },
    });

    this.logger.error(`Webhook subscription failed after 3 attempts for channel ${channelId}`);
    return {
      success: false,
      message: `Failed after 3 attempts: ${lastError}`,
    };
  }

  /**
   * Refresh channel status from Meta Graph API
   * REQ-06: AC-10
   */
  async refreshChannelStatus(
    channelId: string,
    merchantId: string,
  ): Promise<RefreshStatusResponseDto> {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        merchantId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const credentials = channel.credentials as ChannelCredentials;
    if (!credentials.phoneNumberId || !credentials.accessToken) {
      throw new BadRequestException('Channel has incomplete credentials');
    }

    this.logger.log(`Refreshing status for channel: ${channelId}`);

    try {
      // Query Meta Graph API: GET /{phone_number_id}
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        },
      );

      if (response.ok) {
        // Success: update status to connected
        await this.prisma.channel.update({
          where: { id: channelId },
          data: {
            status: 'connected',
            statusReason: null,
            errorCount: 0,
            lastErrorAt: null,
          },
        });

        return {
          success: true,
          status: 'connected',
        };
      } else if (response.status === 401 || response.status === 403) {
        // Auth error
        await this.prisma.channel.update({
          where: { id: channelId },
          data: {
            status: 'error',
            statusReason: 'Invalid credentials or permissions',
            errorCount: { increment: 1 },
            lastErrorAt: new Date(),
          },
        });

        return {
          success: false,
          status: 'error',
        };
      } else if (response.status === 404) {
        // Not found
        await this.prisma.channel.update({
          where: { id: channelId },
          data: {
            status: 'error',
            statusReason: 'Phone number not found',
            errorCount: { increment: 1 },
            lastErrorAt: new Date(),
          },
        });

        return {
          success: false,
          status: 'error',
        };
      } else {
        // Other error: don't update status (preserve last known)
        this.logger.warn(
          `Meta API returned unexpected status ${response.status} for channel ${channelId}`,
        );
        return {
          success: false,
          status: channel.status,
        };
      }
    } catch (error) {
      // Network error: preserve status
      this.logger.error(
        `Failed to refresh status for channel ${channelId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        success: false,
        status: channel.status,
      };
    }
  }

  /**
   * Sleep helper for exponential backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
