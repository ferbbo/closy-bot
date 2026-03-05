/**
 * PR-OB-01: OnboardingController
 * Endpoints del wizard de onboarding para el dashboard del merchant.
 *
 * GET  /onboarding/progress      → calcula progress dinámico
 * POST /onboarding/apply-preset  → aplica preset de industria
 * POST /onboarding/activate      → valida mínimos y activa merchant
 *
 * Auth: SessionAuthGuard (cookie session_id) — consistente con PR-15
 */

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { OnboardingService } from './onboarding.service';
import { OnboardingProgressResponseDto } from './dto/onboarding-progress.response.dto';
import { ApplyPresetRequestDto } from './dto/apply-preset.request.dto';
import { ActivateMerchantResponseDto } from './dto/activate-merchant.response.dto';

@Controller('onboarding')
@UseGuards(SessionAuthGuard)
export class OnboardingController {
  // private readonly logger = new Logger(OnboardingService.name);
  
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * AC-01, AC-02: Calcula progreso dinámico del setup del merchant
   *
   * curl -X GET http://localhost:3000/onboarding/progress \
   *   -H "Cookie: session_id=<session>" | jq
   */
  @Get('progress')
  async getProgress(@Request() req: AuthenticatedRequest): Promise<OnboardingProgressResponseDto> {
    return this.onboardingService.getProgress(req.merchant.id);
  }

  /**
   * AC-04, AC-05: Aplica preset de industria (idempotente)
   *
   * curl -X POST http://localhost:3000/onboarding/apply-preset \
   *   -H "Cookie: session_id=<session>" \
   *   -H "Content-Type: application/json" \
   *   -d '{"industry":"ropa"}' | jq
   */
  @Post('apply-preset')
  @HttpCode(HttpStatus.OK)
  async applyPreset(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ApplyPresetRequestDto,
  ): Promise<{ success: boolean }> {
    return this.onboardingService.applyPreset(req.merchant.id, dto);
  }

  /**
   * AC-06, AC-07: Valida requisitos mínimos y activa merchant (idempotente)
   *
   * curl -X POST http://localhost:3000/onboarding/activate \
   *   -H "Cookie: session_id=<session>" | jq
   */
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Request() req: AuthenticatedRequest): Promise<ActivateMerchantResponseDto> {
    return this.onboardingService.activate(req.merchant.id);
  }
}
