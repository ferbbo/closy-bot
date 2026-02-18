import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Channel, ChannelType, Prisma } from '@prisma/client';

/**
 * Repository for Channel entity
 * Provides data access methods for multi-channel support (PR-03.11)
 */
@Injectable()
export class ChannelRepository {
  private readonly logger = new Logger(ChannelRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find channel by type and external ID
   * Primary lookup method for webhook routing
   *
   * @param type - Channel type (WHATSAPP, INSTAGRAM)
   * @param externalId - Provider-specific ID (phone_number_id for WhatsApp)
   * @returns Channel if found, null otherwise
   */
  async findByTypeAndExternalId(type: ChannelType, externalId: string): Promise<Channel | null> {
    this.logger.debug(`Finding channel: type=${type}, externalId=${externalId}`);

    const channel = await this.prisma.channel.findUnique({
      where: {
        type_externalId: {
          type,
          externalId,
        },
      },
      include: {
        merchant: true,
      },
    });

    if (channel) {
      this.logger.debug(`Channel found: id=${channel.id}, merchant=${channel.merchantId}`);
    } else {
      this.logger.debug(`Channel not found: type=${type}, externalId=${externalId}`);
    }

    return channel;
  }

  /**
   * Find all channels for a merchant
   *
   * @param merchantId - Merchant ID
   * @returns Array of channels
   */
  async findByMerchantId(merchantId: string): Promise<Channel[]> {
    return this.prisma.channel.findMany({
      where: {
        merchantId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Find channel by ID
   *
   * @param id - Channel ID
   * @returns Channel if found, null otherwise
   */
  async findById(id: string): Promise<Channel | null> {
    return this.prisma.channel.findUnique({
      where: { id },
      include: {
        merchant: true,
      },
    });
  }

  /**
   * Create a new channel
   * Used for admin/setup operations
   *
   * @param data - Channel creation data
   * @returns Created channel
   */
  async create(data: Prisma.ChannelCreateInput): Promise<Channel> {
    this.logger.log(`Creating channel: type=${data.type}, merchantId=${data.merchant}`);

    return this.prisma.channel.create({
      data,
      include: {
        merchant: true,
      },
    });
  }

  /**
   * Update channel
   *
   * @param id - Channel ID
   * @param data - Update data
   * @returns Updated channel
   */
  async update(id: string, data: Prisma.ChannelUpdateInput): Promise<Channel> {
    return this.prisma.channel.update({
      where: { id },
      data,
      include: {
        merchant: true,
      },
    });
  }
}
