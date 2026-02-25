/**
 * PR-OB-01: Activate Merchant Response DTO (AC-06)
 *
 * Used on HTTP 200 (success path) only.
 * On failure (missing requirements), the endpoint throws BadRequestException
 * with body: { error: 'Missing requirements', details: string[] }
 * That error path does NOT use this DTO.
 */
export class ActivateMerchantResponseDto {
  /** true si la activación fue exitosa (o ya estaba activo = idempotente) */
  activated!: boolean;

  /** Status actual del merchant tras la operación */
  status!: 'active' | 'onboarding';
}
