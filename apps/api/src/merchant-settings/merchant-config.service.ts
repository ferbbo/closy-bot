/**
 * PR-04.5: MerchantConfigService
 * Handles getOrCreate, update, and getWithDefaults for merchant operational config
 *
 * AC-06: getOrCreateConfig() creates config with preset if none exists
 * AC-07: Presets applied per industry (ropa/belleza/minimarket)
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { UpdateMerchantConfigDto, MerchantConfigResponseDto } from './dto/merchant-config.dto';
import { getPresetForIndustry } from './merchant-config-presets';
import { MerchantConfigData } from '../domain/entities/merchant-config.interface';
import { Industry, Prisma } from '@prisma/client';
import { FeatureFlagsService } from '../common/feature-flags/feature-flags.service';
import { validateDeliveryConfig } from '../verticals/delivery/config/delivery-config.validator';
import { DeliveryConfig } from '../verticals/delivery/contracts';

@Injectable()
export class MerchantConfigService {
  private readonly logger = new Logger(MerchantConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  // ---------------------------------------------------------------------------
  // AC-06: Get or create MerchantConfig with industry preset
  // ---------------------------------------------------------------------------

  /**
   * Returns the MerchantConfig for a merchant.
   * If none exists, creates one using the merchant's industry preset.
   * Throws NotFoundException if merchant does not exist.
   */
  async getOrCreateConfig(merchantId: string): Promise<MerchantConfigResponseDto> {
    // First try to find existing config
    const existing = await this.prisma.merchantConfig.findUnique({
      where: { merchantId },
    });

    if (existing) {
      return this.toResponseDto(existing);
    }

    // Fetch merchant to determine industry preset
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, industry: true },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    // AC-07: Apply industry preset
    const preset = getPresetForIndustry(merchant.industry);
    this.logger.log(
      `Creating MerchantConfig for merchant ${merchantId} with preset: ${merchant.industry ?? 'default'}`,
    );

    const created = await this.prisma.merchantConfig.create({
      data: {
        merchantId,
        paymentMethods: preset.paymentMethods as unknown as Prisma.InputJsonValue,
        shippingConfig: preset.shippingConfig as unknown as Prisma.InputJsonValue,
        returnPolicy: preset.returnPolicy ?? null,
        currency: preset.currency,
        orderCodePrefix: preset.orderCodePrefix,
        autoConfirmCod: preset.autoConfirmCod,
      },
    });

    return this.toResponseDto(created);
  }

  // ---------------------------------------------------------------------------
  // AC-09: Partial update (only sent fields are updated)
  // ---------------------------------------------------------------------------

  /**
   * Updates only the provided fields in MerchantConfig.
   * Fields not included in dto remain unchanged.
   * Creates the config (with preset) if it doesn't exist yet.
   */
  async updateConfig(
    merchantId: string,
    dto: UpdateMerchantConfigDto,
  ): Promise<MerchantConfigResponseDto> {
    // Ensure config exists before updating
    const current = await this.getOrCreateConfig(merchantId);

    // Build partial update data — only non-undefined fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    if (dto.paymentMethods !== undefined) {
      updateData['paymentMethods'] = dto.paymentMethods as unknown as Prisma.InputJsonValue;
    }
    if (dto.shippingConfig !== undefined) {
      updateData['shippingConfig'] = dto.shippingConfig as Prisma.InputJsonValue;
    }
    if (dto.returnPolicy !== undefined) {
      updateData['returnPolicy'] = dto.returnPolicy;
    }
    if (dto.currency !== undefined) {
      updateData['currency'] = dto.currency;
    }
    if (dto.orderCodePrefix !== undefined) {
      updateData['orderCodePrefix'] = dto.orderCodePrefix;
    }
    if (dto.autoConfirmCod !== undefined) {
      updateData['autoConfirmCod'] = dto.autoConfirmCod;
    }
    if (dto.businessHours !== undefined) {
      updateData['businessHours'] = dto.businessHours;
    }
    if (dto.deliveryConfig !== undefined) {
      updateData['deliveryConfig'] = await this.resolveDeliveryConfigPatch(
        merchantId,
        dto.deliveryConfig,
        current.deliveryConfig,
      );
    }

    const updated = await this.prisma.merchantConfig.update({
      where: { merchantId },
      data: updateData,
    });

    return this.toResponseDto(updated);
  }

  // ---------------------------------------------------------------------------
  // getConfigWithDefaults: alias for getOrCreateConfig (always returns defaults)
  // ---------------------------------------------------------------------------

  async getConfigWithDefaults(merchantId: string): Promise<MerchantConfigResponseDto> {
    return this.getOrCreateConfig(merchantId);
  }

  // ---------------------------------------------------------------------------
  // Delivery vertical (S1.2-T4): PATCH deliveryConfig
  // ---------------------------------------------------------------------------

  /**
   * Gated: flag DELIVERY_ENABLED (403) + industry=restaurante (403).
   * El override se mezcla sobre la config guardada (o los defaults técnicos) y se
   * valida completo; error → 400 con el path exacto (`deliveryConfig.zones[0].fee`).
   */
  private async resolveDeliveryConfigPatch(
    merchantId: string,
    input: Record<string, unknown> | null,
    stored: DeliveryConfig | null,
  ): Promise<Prisma.InputJsonValue | typeof Prisma.DbNull> {
    if (!this.featureFlags.isDeliveryEnabled) {
      throw new ForbiddenException('deliveryConfig is not available (delivery feature disabled)');
    }
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { industry: true },
    });
    if (merchant?.industry !== Industry.restaurante) {
      throw new ForbiddenException('deliveryConfig requires merchant industry "restaurante"');
    }
    if (input === null) return Prisma.DbNull;

    const storedResult = stored ? validateDeliveryConfig(stored) : null;
    const base = storedResult?.ok ? storedResult.value : undefined;
    const result = validateDeliveryConfig(input, base);
    if (!result.ok) {
      const errors = result.errors.map((e) => ({
        path: e.path ? `deliveryConfig.${e.path}` : 'deliveryConfig',
        message: e.message,
      }));
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: errors.map((e) => `${e.path} ${e.message}`),
        errors,
      });
    }
    return result.value as unknown as Prisma.InputJsonValue;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toResponseDto(record: {
    id: string;
    merchantId: string;
    paymentMethods: Prisma.JsonValue;
    shippingConfig: Prisma.JsonValue;
    returnPolicy: string | null;
    businessHours: string | null;
    currency: string;
    orderCodePrefix: string;
    autoConfirmCod: boolean;
    deliveryConfig?: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): MerchantConfigResponseDto {
    const data = record as unknown as {
      id: string;
      merchantId: string;
      paymentMethods: MerchantConfigData['paymentMethods'];
      shippingConfig: MerchantConfigData['shippingConfig'];
      returnPolicy: string | null;
      businessHours: string | null;
      currency: string;
      orderCodePrefix: string;
      autoConfirmCod: boolean;
      deliveryConfig?: DeliveryConfig | null;
      createdAt: Date;
      updatedAt: Date;
    };

    const dto = new MerchantConfigResponseDto();
    dto.id = data.id;
    dto.merchantId = data.merchantId;
    dto.paymentMethods = data.paymentMethods;
    dto.shippingConfig = data.shippingConfig;
    dto.returnPolicy = data.returnPolicy;
    dto.businessHours = data.businessHours;
    dto.currency = data.currency;
    dto.orderCodePrefix = data.orderCodePrefix;
    dto.autoConfirmCod = data.autoConfirmCod;
    dto.deliveryConfig = data.deliveryConfig ?? null;
    dto.createdAt = data.createdAt;
    dto.updatedAt = data.updatedAt;
    return dto;
  }
}
