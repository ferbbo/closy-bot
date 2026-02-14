import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { Merchant } from '@prisma/client';

/**
 * MerchantResolverService
 * Resolves merchant by WhatsApp phone number ID
 */
@Injectable()
export class MerchantResolverService {
  private readonly logger = new Logger(MerchantResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve merchant by WhatsApp phone number
   * For MVP: single merchant, so we return the first one
   * Future: lookup by whatsappNumber or phoneNumberId
   *
   * @param receiverPhoneId - WhatsApp phone number ID (from inbound webhook)
   * @returns Merchant entity
   * @throws NotFoundException if no merchant found
   */
  async resolveByWhatsAppPhoneId(receiverPhoneId: string): Promise<Merchant> {
    this.logger.debug(`Resolving merchant for phone ID: ${receiverPhoneId}`);

    // MVP: For now, return the first merchant
    // Future: Add receiverPhoneId mapping to merchant
    const merchant = await this.prisma.merchant.findFirst();

    if (!merchant) {
      this.logger.error('No merchant found in database');
      throw new NotFoundException('No merchant configured');
    }

    this.logger.debug(`Resolved merchant: ${merchant.id} (${merchant.name})`);

    return merchant;
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
