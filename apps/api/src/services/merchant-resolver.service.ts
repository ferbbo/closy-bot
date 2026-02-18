import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { Channel, ChannelType, Merchant } from '@prisma/client';
import { ChannelRepository } from '../persistence/repositories/channel.repository';

export interface ResolveByChannelResult {
  merchant: Merchant;
  channel: Channel;
}

/**
 * MerchantResolverService
 * Resolves merchant by channel (WhatsApp phone number ID, Instagram page ID, etc.)
 * PR-03.11: Refactored for multi-channel support
 */
@Injectable()
export class MerchantResolverService {
  private readonly logger = new Logger(MerchantResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelRepository: ChannelRepository,
  ) {}

  /**
   * Resolve merchant and channel by channel type and external ID
   * Primary method for webhook routing (PR-03.11)
   *
   * @param type - Channel type (WHATSAPP, INSTAGRAM)
   * @param externalId - Provider-specific ID (phone_number_id for WhatsApp)
   * @returns Merchant and Channel if found, null otherwise
   */
  async resolveByChannel(
    type: ChannelType,
    externalId: string,
  ): Promise<ResolveByChannelResult | null> {
    this.logger.debug(`Resolving merchant by channel: type=${type}, externalId=${externalId}`);

    const channel = await this.channelRepository.findByTypeAndExternalId(type, externalId);

    if (!channel) {
      this.logger.warn(
        `Channel not found: type=${type}, externalId=${externalId}. ` +
          `This is expected for unknown channels (AC-08).`,
      );
      return null;
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: channel.merchantId },
    });

    if (!merchant) {
      // Should not happen due to FK constraint, but defensive check
      this.logger.error(
        `Merchant not found for channel: channelId=${channel.id}, merchantId=${channel.merchantId}`,
      );
      return null;
    }

    this.logger.debug(
      `Resolved: merchant=${merchant.id} (${merchant.name}), channel=${channel.id} (${channel.displayName})`,
    );

    return { merchant, channel };
  }

  /**
   * Resolve merchant by WhatsApp phone number ID
   * Convenience wrapper for backwards compatibility
   * For MVP: delegates to resolveByChannel()
   *
   * @param receiverPhoneId - WhatsApp phone number ID (from inbound webhook)
   * @returns Merchant entity
   * @throws NotFoundException if no channel/merchant found
   * @deprecated Use resolveByChannel() directly for new code
   */
  async resolveByWhatsAppPhoneId(receiverPhoneId: string): Promise<Merchant> {
    this.logger.debug(`Resolving merchant for phone ID: ${receiverPhoneId} (legacy method)`);

    const result = await this.resolveByChannel(ChannelType.WHATSAPP, receiverPhoneId);

    if (!result) {
      this.logger.error(`No merchant found for WhatsApp phone ID: ${receiverPhoneId}`);
      throw new NotFoundException('No merchant configured for this channel');
    }

    return result.merchant;
  }

  /**
   * Get merchant by ID
   *
   * @param merchantId - Merchant ID
   * @returns Merchant entity
   * @throws NotFoundException if merchant not found
   */
  async getById(merchantId: string): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant not found: ${merchantId}`);
    }

    return merchant;
  }
}
