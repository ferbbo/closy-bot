/**
 * PR-OB-01: Activate Merchant Response DTO
 * AC-06, AC-07
 */

export class ActivateMerchantResponseDto {
  /** true si la activación fue exitosa (o ya estaba activo) */
  activated!: boolean;

  /** Status actual del merchant */
  status!: 'active' | 'onboarding';

  /** Requisitos faltantes (solo cuando activated=false) */
  missingRequirements?: string[];
}
