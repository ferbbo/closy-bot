import { Injectable } from '@nestjs/common';
import type {
  KitchenTicket,
  PosAdapter,
  PosCapabilities,
  PosContext,
  PosResult,
} from '../../contracts';

export const NOOP_POS_PROVIDER = 'none';

/**
 * NoopPosAdapter (S3.4-T1): fallback del registry cuando el comercio no tiene POS
 * (`provider='none'`), lo tiene deshabilitado o el proveedor no está registrado.
 *
 * - `capabilities()` es todo `false`, incluido `pushOrder`: no empuja a ningún sistema.
 *   `PosOrderSink` usa eso (o `provider === 'none'`) para marcar `posSyncStatus='skipped'`
 *   sin llamar a `pushOrder` (RN-23 / AC-30).
 * - `pushOrder` existe porque el contrato lo exige: devuelve `ok` con un externalId
 *   determinista por `orderId` (idempotente) y nunca hace llamadas externas ni lee secretos.
 */
@Injectable()
export class NoopPosAdapter implements PosAdapter {
  readonly provider = NOOP_POS_PROVIDER;

  capabilities(): PosCapabilities {
    return { pushOrder: false, cancelOrder: false, pullCatalog: false, statusUpdates: false };
  }

  async pushOrder(
    ticket: KitchenTicket,
    _ctx: PosContext,
  ): Promise<PosResult<{ externalId: string }>> {
    return { ok: true, value: { externalId: `noop:${ticket.orderId}` } };
  }
}
