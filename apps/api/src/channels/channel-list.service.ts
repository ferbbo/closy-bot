import { Injectable, Logger } from '@nestjs/common';
import { ChannelRepository } from '../persistence/repositories/channel.repository';
import { ChannelListItemDto } from './dto/channel-list.dto';

/**
 * Service for listing merchant channels
 * REQ-02: ChannelListService + DTO sin credentials
 */
@Injectable()
export class ChannelListService {
  private readonly logger = new Logger(ChannelListService.name);

  constructor(private readonly channelRepository: ChannelRepository) {}

  /**
   * Get all channels for a merchant
   * REQ-02, AC-03, AC-04, AC-05
   *
   * @param merchantId - Merchant ID from authenticated session
   * @returns Array of channel DTOs (without credentials)
   */
  async getChannels(merchantId: string): Promise<ChannelListItemDto[]> {
    this.logger.debug(`Listing channels for merchant ${merchantId}`);

    // AC-05: Repository already filters by isActive=true
    const channels = await this.channelRepository.findByMerchantId(merchantId);

    this.logger.debug(`Found ${channels.length} channels for merchant ${merchantId}`);

    // AC-04: Map to safe DTO without credentials
    return channels.map((channel) => ({
      id: channel.id,
      type: channel.type,
      displayName: channel.displayName,
      status: channel.status,
      webhookSubscribed: channel.webhookSubscribed,
      lastWebhookAt: channel.lastWebhookAt,
      createdAt: channel.createdAt,
    }));
  }
}
