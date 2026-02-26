import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MetaEmbeddedSignupProvider } from './providers/meta-embedded-signup.provider';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { WabaInfoDto } from './dto/waba-info.dto';
import { FeatureFlagsService } from '../common/feature-flags/feature-flags.service';

interface ChannelCredentials {
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
  appSecret?: string;
}

/**
 * Service for Meta OAuth flow and channel onboarding
 *
 * REQ-03: OAuth flow orchestration
 * REQ-06: Automatic webhook subscription
 * REQ-09: Idempotency for phone_number_id
 */
@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);
  private readonly redirectUri: string;
  private readonly webhookUrl: string;
  private readonly webhookVerifyToken: string;

  constructor(
    private readonly metaProvider: MetaEmbeddedSignupProvider,
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
  ) {
    // META_REDIRECT_URI is the full callback URL (not baseUrl)
    this.redirectUri =
      process.env.META_REDIRECT_URI || 'http://localhost:3000/onboarding/whatsapp/callback';
    // Extract base URL for webhook URL construction
    const baseUrl = this.redirectUri.replace(/\/onboarding\/whatsapp\/callback$/, '');
    this.webhookUrl = `${baseUrl}/webhooks/whatsapp`;
    this.webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default-verify-token';
  }

  /**
   * Start OAuth flow: generate state and authorization URL
   * REQ-04: Endpoint start with state cookie
   * AC-04: should redirect to Meta
   */
  startOnboarding(): { state: string; authUrl: string } {
    const state = randomUUID();
    const authUrl = this.metaProvider.getAuthorizationUrl(state, this.redirectUri);

    this.logger.log(`OAuth flow started with state: ${state.substring(0, 8)}...`);
    return { state, authUrl };
  }

  /**
   * Handle OAuth callback: exchange code, fetch WABA, create/update channel
   * REQ-05: Callback endpoint with exchange + create Channel
   * REQ-06: Automatic webhook subscription
   * REQ-09: Idempotency for phone_number_id
   * AC-06: exchange code and create Channel
   * AC-08: Channel includes wabaId, phoneNumberId, status=pending
   * AC-09: Webhook subscription updates webhookSubscribed=true
   * AC-12: phone_number_id duplicated for another merchant -> 409
   * AC-13: phone_number_id duplicated for same merchant -> update (idempotent)
   */
  async handleCallback(
    code: string,
    merchantId: string,
  ): Promise<{ channelId: string; displayName: string }> {
    this.logger.log(`Handling OAuth callback for merchant: ${merchantId}`);

    // 1. Exchange code for access token
    const tokenResponse = await this.metaProvider.exchangeCodeForToken(code, this.redirectUri);
    const accessToken = tokenResponse.access_token;

    // 2. Fetch WABA info
    const wabaInfo = await this.metaProvider.fetchWabaInfo(accessToken);

    if (!wabaInfo.phone_numbers || wabaInfo.phone_numbers.length === 0) {
      throw new BadRequestException('No phone numbers found in WABA');
    }

    // Use first phone number (future: let user select)
    const phoneNumber = wabaInfo.phone_numbers[0];
    const wabaData: WabaInfoDto = {
      wabaId: wabaInfo.id,
      wabaName: wabaInfo.name,
      phoneNumberId: phoneNumber.id,
      displayPhoneNumber: phoneNumber.display_phone_number,
      verifiedName: phoneNumber.verified_name,
      accessToken,
    };

    // 3. Check idempotency: phone_number_id already exists?
    const existingChannel = await this.prisma.channel.findUnique({
      where: {
        type_externalId: {
          type: 'WHATSAPP',
          externalId: wabaData.phoneNumberId,
        },
      },
      include: {
        merchant: true,
      },
    });

    // REQ-03 / AC-04 / AC-05: Gating — block second channel in MVP mode
    // Only check if this phone number is NOT already owned by this merchant (new channel)
    if (!existingChannel || existingChannel.merchantId !== merchantId) {
      if (!this.featureFlags.isMultiChannelEnabled) {
        const channelCount = await this.prisma.channel.count({
          where: { merchantId },
        });
        if (channelCount >= 1) {
          throw new ForbiddenException('Multi-channel requires enterprise plan');
        }
      }
    }

    // REQ-09: AC-12 - Different merchant owns this phone number
    if (existingChannel && existingChannel.merchantId !== merchantId) {
      this.logger.warn(
        `Phone number ${wabaData.phoneNumberId} already connected to merchant ${existingChannel.merchantId}`,
      );
      throw new ConflictException('Phone number already connected to another merchant');
    }

    // REQ-09: AC-13 - Same merchant, update credentials (idempotent)
    if (existingChannel && existingChannel.merchantId === merchantId) {
      this.logger.log(
        `Updating existing channel ${existingChannel.id} for merchant ${merchantId} (idempotent)`,
      );

      const updatedChannel = await this.updateChannelCredentials(existingChannel.id, wabaData);

      // Attempt webhook subscription
      await this.attemptWebhookSubscription(updatedChannel.id, wabaData);

      return {
        channelId: updatedChannel.id,
        displayName: updatedChannel.displayName,
      };
    }

    // 4. Create new channel
    const channel = await this.prisma.channel.create({
      data: {
        merchantId,
        type: 'WHATSAPP',
        externalId: wabaData.phoneNumberId,
        displayName: wabaData.verifiedName,
        credentials: {
          accessToken: wabaData.accessToken,
          phoneNumberId: wabaData.phoneNumberId,
          wabaId: wabaData.wabaId,
          appSecret: process.env.META_APP_SECRET,
        },
        wabaId: wabaData.wabaId,
        status: 'pending', // Initial status
        isActive: true,
      },
    });

    this.logger.log(`Channel created: ${channel.id} for merchant ${merchantId}`);

    // 5. Subscribe webhook automatically (REQ-06)
    await this.attemptWebhookSubscription(channel.id, wabaData);

    return {
      channelId: channel.id,
      displayName: channel.displayName,
    };
  }

  /**
   * Update existing channel credentials (idempotent flow)
   */
  private async updateChannelCredentials(channelId: string, wabaData: WabaInfoDto) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data: {
        credentials: {
          accessToken: wabaData.accessToken,
          phoneNumberId: wabaData.phoneNumberId,
          wabaId: wabaData.wabaId,
          appSecret: process.env.META_APP_SECRET,
        },
        wabaId: wabaData.wabaId,
        displayName: wabaData.verifiedName,
        status: 'pending', // Reset to pending for re-subscription
        statusReason: null,
      },
    });
  }

  /**
   * Attempt webhook subscription and update channel status
   * AC-09: Webhook subscription updates webhookSubscribed=true on success
   * AC-15: Subscription failure sets status=connected but webhookSubscribed=false
   */
  private async attemptWebhookSubscription(
    channelId: string,
    wabaData: WabaInfoDto,
  ): Promise<void> {
    const subscriptionResult = await this.metaProvider.subscribeWebhook(
      wabaData.wabaId,
      wabaData.accessToken,
      this.webhookUrl,
      this.webhookVerifyToken,
    );

    if (subscriptionResult.success) {
      this.logger.log(`Webhook subscription successful for channel: ${channelId}`);
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          status: 'connected',
          statusReason: null,
          webhookSubscribed: true,
          lastWebhookAt: new Date(),
        },
      });
    } else {
      this.logger.warn(
        `Webhook subscription failed for channel: ${channelId} - ${subscriptionResult.error}`,
      );
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          status: 'connected', // Still connected, but webhook not subscribed
          statusReason: `Webhook subscription failed: ${subscriptionResult.error}`,
          webhookSubscribed: false,
        },
      });
    }
  }

  /**
   * Retry webhook subscription manually
   * REQ-07: Endpoint for manual retry
   * AC-10: Retry endpoint should work
   */
  async retryWebhookSubscription(
    channelId: string,
    merchantId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verify channel belongs to merchant
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        merchantId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found or access denied');
    }

    if (!channel.wabaId) {
      throw new BadRequestException('Channel has no WABA ID');
    }

    const credentials = channel.credentials as ChannelCredentials;
    if (!credentials.accessToken) {
      throw new BadRequestException('Channel has no access token');
    }

    this.logger.log(`Retrying webhook subscription for channel: ${channelId}`);

    const subscriptionResult = await this.metaProvider.subscribeWebhook(
      channel.wabaId,
      credentials.accessToken,
      this.webhookUrl,
      this.webhookVerifyToken,
    );

    if (subscriptionResult.success) {
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          status: 'connected',
          statusReason: null,
          webhookSubscribed: true,
          lastWebhookAt: new Date(),
        },
      });

      return {
        success: true,
        message: 'Webhook subscription successful',
      };
    } else {
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          statusReason: `Webhook subscription retry failed: ${subscriptionResult.error}`,
        },
      });

      return {
        success: false,
        message: subscriptionResult.error || 'Webhook subscription failed',
      };
    }
  }
}
