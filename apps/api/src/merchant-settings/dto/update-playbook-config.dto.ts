import {
  IsOptional,
  IsEnum,
  IsObject,
  ValidateNested,
  IsString,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Industry } from '@prisma/client';

/**
 * DTOs for PlaybookConfig structure validation
 * Used by PUT/PATCH /merchants/me/playbook
 */

/**
 * PR-FE-OB-2: FAQ entry DTO (AC-08)
 * Validates individual FAQ items for keyword-based matching
 */
export class FaqDto {
  @IsString()
  @MaxLength(100)
  question!: string;

  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @IsString()
  @MaxLength(300)
  answer!: string;
}

export class LlmPromptConfigDto {
  @IsString()
  @IsOptional()
  tone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  focusAreas?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  commonQuestions?: string[];

  @IsString()
  @IsOptional()
  upsellStrategy?: string;

  @IsEnum(['none', 'moderate', 'frequent'])
  @IsOptional()
  emojiUsage?: 'none' | 'moderate' | 'frequent';
}

export class CheckoutQuestionDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsEnum(['text', 'choice', 'boolean'])
  type!: 'text' | 'choice' | 'boolean';

  @IsBoolean()
  required!: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsString()
  @IsOptional()
  default?: string;
}

export class PlaybookMessagesDto {
  // ── Existing (PR-11) ──────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  greeting?: string;

  @IsString()
  @IsOptional()
  addToCartConfirm?: string;

  @IsString()
  @IsOptional()
  noStock?: string;

  @IsString()
  @IsOptional()
  upsellTemplate?: string;

  @IsString()
  @IsOptional()
  checkoutStart?: string;

  // ── New (PR-GAP-1) ────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  searchNoResults?: string;

  @IsString()
  @IsOptional()
  helpMenu?: string;

  @IsString()
  @IsOptional()
  cartEmpty?: string;

  @IsString()
  @IsOptional()
  cartSummaryHeader?: string;

  @IsString()
  @IsOptional()
  cartSummaryFooter?: string;

  @IsString()
  @IsOptional()
  removeConfirm?: string;

  @IsString()
  @IsOptional()
  updateConfirm?: string;

  @IsString()
  @IsOptional()
  quantityInvalid?: string;

  @IsString()
  @IsOptional()
  productNotFound?: string;

  @IsString()
  @IsOptional()
  productMultipleOptions?: string;

  @IsString()
  @IsOptional()
  variantMultipleOptions?: string;

  @IsString()
  @IsOptional()
  itemNotInCart?: string;

  @IsString()
  @IsOptional()
  cartEmptyNoAction?: string;

  @IsString()
  @IsOptional()
  genericError?: string;

  @IsString()
  @IsOptional()
  unknownIntent?: string;

  // ── Order status & post-sale (PR-04 / playbook-config.interface.ts) ──────
  @IsString()
  @IsOptional()
  orderStatusTemplate?: string;

  @IsString()
  @IsOptional()
  orderStatusPendingPayment?: string;

  @IsString()
  @IsOptional()
  orderStatusConfirmed?: string;

  @IsString()
  @IsOptional()
  orderStatusPaid?: string;

  @IsString()
  @IsOptional()
  orderStatusShipped?: string;

  @IsString()
  @IsOptional()
  orderStatusDelivered?: string;

  @IsString()
  @IsOptional()
  orderStatusCancelled?: string;

  @IsString()
  @IsOptional()
  noOrderFound?: string;

  @IsString()
  @IsOptional()
  ticketTypePrompt?: string;

  @IsString()
  @IsOptional()
  ticketCreatedConfirm?: string;

  @IsString()
  @IsOptional()
  ticketDescriptionPrompt?: string;
}

export class PlaybookRulesDto {
  @IsBoolean()
  @IsOptional()
  askSizeBeforeCart?: boolean;

  @IsBoolean()
  @IsOptional()
  askSkinTypeOnSearch?: boolean;

  @IsBoolean()
  @IsOptional()
  autoSubstitutions?: boolean;

  @IsBoolean()
  @IsOptional()
  upsellEnabled?: boolean;

  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRecommendations?: number;
}

/**
 * PR-GAP-1: BotPersonality DTO
 */
export class BotPersonalityDto {
  @IsEnum(['friendly', 'professional', 'enthusiastic', 'minimal'])
  @IsOptional()
  style?: 'friendly' | 'professional' | 'enthusiastic' | 'minimal';

  @IsEnum(['none', 'moderate', 'frequent'])
  @IsOptional()
  emojiUsage?: 'none' | 'moderate' | 'frequent';

  @IsString()
  @IsOptional()
  signatureEmoji?: string;
}

/**
 * Main DTO for updating entire or partial PlaybookConfig
 */
export class UpdatePlaybookConfigDto {
  @IsEnum(Industry)
  @IsOptional()
  industry?: Industry;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => LlmPromptConfigDto)
  llmPrompt?: LlmPromptConfigDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutQuestionDto)
  @IsOptional()
  checkoutQuestions?: CheckoutQuestionDto[];

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => PlaybookMessagesDto)
  messages?: PlaybookMessagesDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => PlaybookRulesDto)
  rules?: PlaybookRulesDto;

  /** PR-GAP-1: High-level bot personality selector */
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => BotPersonalityDto)
  botPersonality?: BotPersonalityDto;

  /** PR-FE-OB-2: FAQ array for keyword-based matching (max 10 items) */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FaqDto)
  faqs?: FaqDto[];
}
