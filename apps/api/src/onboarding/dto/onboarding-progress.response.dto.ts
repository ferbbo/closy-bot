/**
 * PR-OB-01: Onboarding Progress Response DTO
 * AC-01, AC-02
 */

export class OnboardingProgressResponseDto {
  /** Steps ya completados por el merchant */
  completedSteps!: string[];

  /** Steps pendientes */
  pendingSteps!: string[];

  /** Porcentaje de progreso 0-100 (cada step = 20%) */
  percentage!: number;

  /** Siguiente step sugerido para guiar UI (null si todos completos) */
  nextStep!: string | null;
}
