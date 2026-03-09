/**
 * PR-OB-01: OnboardingService
 * Calcula progreso dinámicamente, aplica presets e industria, activa merchant.
 *
 * AC-01: getProgress() calcula steps dinámicamente sin tabla extra
 * AC-02: percentage = completedSteps.length / TOTAL_STEPS * 100
 * AC-03: métodos getProgress(), applyPreset(), activate() expuestos
 * AC-04: applyPreset() actualiza Merchant.industry + playbookConfig
 * AC-05: applyPreset() aplica MerchantConfig defaults
 * AC-06: activate() valida requisitos mínimos (channel, catalog, config)
 * AC-07: activate() cambia Merchant.status = 'active' cuando OK
 * AC-08: Merchant.status default='onboarding' (garantizado por migración)
 *
 * NOTE: ALL_STEPS incluye solo los 4 pasos visibles del wizard (channel, catalog,
 * config, test). El paso 'profile' se evaluaba internamente pero no aparece en
 * el UI → se eliminó para que percentage = completedSteps/4 (25% por paso).
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PlaybookService } from '../services/playbook.service';
import { MerchantConfigService } from '../merchant-settings/merchant-config.service';
import { MessageDirection, Prisma } from '@prisma/client';
import { OnboardingProgressResponseDto } from './dto/onboarding-progress.response.dto';
import { ActivateMerchantResponseDto } from './dto/activate-merchant.response.dto';
import { ApplyPresetRequestDto } from './dto/apply-preset.request.dto';

/** Steps del wizard (4 pasos × 25% cada uno — alineado con el UI) */
const ALL_STEPS = ['channel', 'catalog', 'config', 'test'] as const;
type Step = (typeof ALL_STEPS)[number];

/** Requisitos mínimos para activar (hard requirements) */
const ACTIVATION_REQUIRED_STEPS: Step[] = ['channel', 'catalog', 'config'];

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly playbookService: PlaybookService,
    private readonly merchantConfigService: MerchantConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // AC-01, AC-02: Cálculo dinámico de progreso (no stored)
  // ---------------------------------------------------------------------------

  /**
   * Calcula el estado de setup del merchant sin tabla adicional.
   * Eager-loads relaciones en 1 query para evitar N+1.
   */
  async getProgress(merchantId: string): Promise<OnboardingProgressResponseDto> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: {
        channels: { where: { isActive: true }, select: { id: true } },
        products: { select: { id: true }, take: 1 },
        merchantConfig: { select: { id: true, paymentMethods: true } },
      },
    });

    // Test step: ≥1 MessageLog inbound (direction=IN) para este merchant
    // Representa que al menos 1 mensaje fue recibido/procesado por el bot
    const testMessage = await this.prisma.messageLog.findFirst({
      where: { merchantId, direction: MessageDirection.IN },
      select: { id: true },
    });

    const completedSteps = this.computeCompletedSteps(merchant, testMessage !== null);
    const pendingSteps = ALL_STEPS.filter((s) => !completedSteps.includes(s as Step));
    const percentage = Math.round((completedSteps.length / ALL_STEPS.length) * 100);
    const nextStep = pendingSteps[0] ?? null;

    return { completedSteps, pendingSteps, percentage, nextStep };
  }

  // ---------------------------------------------------------------------------
  // AC-04, AC-05: Aplicar preset de industria (idempotente)
  // ---------------------------------------------------------------------------

  /**
   * Aplica preset de industria: actualiza Merchant.industry, playbookConfig,
   * y getOrCreate MerchantConfig con defaults de la industria.
   *
   * Idempotencia:
   * - Merchant.industry → siempre se establece al valor del preset
   * - playbookConfig:
   *   - Si null → aplica defaults completos de la industria
   *   - Si existe → solo actualiza el campo `industry` dentro del JSON (preserva customizaciones)
   * - MerchantConfig → getOrCreate (crea si no existe, ignora si ya existe)
   */
  async applyPreset(merchantId: string, dto: ApplyPresetRequestDto): Promise<{ success: boolean }> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { id: true, name: true, industry: true, playbookConfig: true },
    });

    // Calcular el playbookConfig nuevo
    let newPlaybookConfig: Prisma.InputJsonValue;
    if (!merchant.playbookConfig) {
      // Sin config previa → aplicar defaults completos
      const defaults = this.playbookService.getPlaybookForMerchant({
        id: merchant.id,
        name: merchant.name,
        industry: dto.industry,
        playbookConfig: null, // fuerza defaults
      });
      newPlaybookConfig = defaults as unknown as Prisma.InputJsonValue;
      this.logger.log(`Applying full preset '${dto.industry}' to merchant ${merchantId}`);
    } else {
      // Config existente → solo actualiza el campo industry dentro del JSON
      const existing = merchant.playbookConfig as Record<string, unknown>;
      newPlaybookConfig = {
        ...existing,
        industry: dto.industry,
      } as Prisma.InputJsonValue;
      this.logger.log(
        `Updating industry to '${dto.industry}' for merchant ${merchantId} (preserving existing config)`,
      );
    }

    // Actualizar Merchant.industry y playbookConfig
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        industry: dto.industry,
        playbookConfig: newPlaybookConfig,
      },
    });

    // getOrCreate MerchantConfig con los defaults de la industria
    // Si ya existe → no-op; si no → crea con preset
    await this.merchantConfigService.getOrCreateConfig(merchantId);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // AC-06, AC-07: Activar merchant (idempotente)
  // ---------------------------------------------------------------------------

  /**
   * Valida requisitos mínimos y cambia Merchant.status a 'active'.
   * Idempotente: merchant ya activo → retorna 200 OK sin cambios.
   */
  async activate(merchantId: string): Promise<ActivateMerchantResponseDto> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { id: true, status: true },
    });

    // Idempotencia: ya activo → retorna éxito
    if (merchant.status === 'active') {
      this.logger.debug(`Merchant ${merchantId} is already active — no-op`);
      return { activated: true, status: 'active' };
    }

    // Calcular progress para validar requisitos
    const progress = await this.getProgress(merchantId);

    // Verificar requisitos mínimos
    const missingRequirements = ACTIVATION_REQUIRED_STEPS.filter(
      (s) => !progress.completedSteps.includes(s),
    );

    if (missingRequirements.length > 0) {
      this.logger.warn(
        `Activation rejected for merchant ${merchantId}: missing ${missingRequirements.join(', ')}`,
      );
      throw new BadRequestException({
        error: 'Missing requirements',
        details: missingRequirements,
      });
    }

    // Activar merchant
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { status: 'active' },
    });

    this.logger.log(`Merchant ${merchantId} activated successfully`);
    return { activated: true, status: 'active' };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Computed completed steps given merchant+relations snapshot.
   * AC-01: condiciones por step (sin tabla extra)
   */
  private computeCompletedSteps(
    merchant: {
      channels: { id: string }[];
      products: { id: string }[];
      merchantConfig: { id: string; paymentMethods: unknown } | null;
    },
    hasProcessedMessage: boolean,
  ): Step[] {
    const completed: Step[] = [];

    // channel: ≥1 Channel con isActive=true
    if (merchant.channels.length > 0) {
      completed.push('channel');
    }

    // catalog: ≥1 Product
    if (merchant.products.length > 0) {
      completed.push('catalog');
    }

    // config: MerchantConfig con ≥1 payment method
    if (merchant.merchantConfig) {
      const methods = merchant.merchantConfig.paymentMethods as unknown[];
      if (Array.isArray(methods) && methods.length > 0) {
        completed.push('config');
      }
    }

    // test: ≥1 MessageLog inbound (direction=IN) para este merchant
    if (hasProcessedMessage) {
      completed.push('test');
    }

    return completed;
  }
}
