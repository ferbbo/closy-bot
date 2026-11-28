/**
 * PR-04.5: MerchantConfig DTOs
 * Request/response shapes for GET /merchants/me/config and PATCH /merchants/me/config
 */
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsPositive,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { DeliveryConfig } from '../../verticals/delivery/contracts';

// ---------------------------------------------------------------------------
// Nested validators
// ---------------------------------------------------------------------------

export class BankInfoDto {
  @IsString()
  bankName!: string;

  @IsString()
  accountNumber!: string;

  @IsIn(['ahorros', 'corriente'])
  accountType!: 'ahorros' | 'corriente';

  @IsString()
  accountHolder!: string;
}

export class PaymentMethodConfigDto {
  @IsIn(['cod', 'transfer', 'payment_link'])
  type!: 'cod' | 'transfer' | 'payment_link';

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BankInfoDto)
  bankInfo?: BankInfoDto;

  /** PR-FE-OB-2: URL for payment_link type methods */
  @IsOptional()
  @IsString()
  paymentLinkUrl?: string;
}

export class ShippingConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zones?: string[];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  flatRate?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  freeAbove?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  estimatedDays?: string;

  /** PR-FE-OB-2: Human-readable shipping policy text */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingPolicy?: string;
}

// ---------------------------------------------------------------------------
// PATCH /merchants/me/config — Partial update DTO
// ---------------------------------------------------------------------------

export class UpdateMerchantConfigDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodConfigDto)
  paymentMethods?: PaymentMethodConfigDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingConfigDto)
  shippingConfig?: ShippingConfigDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  returnPolicy?: string | null;

  /** PR-FE-OB-2: Business opening hours (max 200 chars) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessHours?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  orderCodePrefix?: string;

  @IsOptional()
  @IsBoolean()
  autoConfirmCod?: boolean;

  /**
   * Delivery vertical (B2, flag DELIVERY_ENABLED, industry=restaurante).
   * Override parcial de DeliveryConfig; lo valida `validateDeliveryConfig`
   * (400 con el path exacto). `null` borra la config (vuelven los defaults técnicos).
   */
  @IsOptional()
  @IsObject()
  deliveryConfig?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Response DTO
// ---------------------------------------------------------------------------

export class MerchantConfigResponseDto {
  id!: string;
  merchantId!: string;
  paymentMethods!: PaymentMethodConfigDto[];
  shippingConfig!: ShippingConfigDto;
  returnPolicy?: string | null;
  /** PR-FE-OB-2 */
  businessHours?: string | null;
  currency!: string;
  orderCodePrefix!: string;
  autoConfirmCod!: boolean;
  /** Delivery vertical: DeliveryConfig guardado (null si no se ha configurado) */
  deliveryConfig!: DeliveryConfig | null;
  createdAt!: Date;
  updatedAt!: Date;
}
