/**
 * FakePosAdapter — POS falso para unit y e2e (S3.4-T1). Nunca hace llamadas externas.
 *
 * Uso:
 *   FakePosAdapter.ok()                    // siempre ok
 *   FakePosAdapter.failing()               // siempre falla, no reintentable
 *   FakePosAdapter.retryable()             // siempre falla, reintentable
 *   FakePosAdapter.failingThenOk(1)        // 1 falla reintentable y luego ok
 *   new FakePosAdapter({ provider: 'loggro', failTimes: 2, retryable: false })
 *
 * - Idempotente por `ticket.orderId`: una vez aceptado, repetir devuelve el mismo externalId
 *   sin consumir fallos.
 * - `calls` registra cada llamada (método, orderId, merchantId, si resolvió secreto). Nunca
 *   guarda el valor del secreto ni el `secretRef`.
 *
 * Importable desde specs unit en src (ruta relativa a `apps/api/test/utils/fake-pos.adapter`).
 */
import type {
  KitchenTicket,
  PosAdapter,
  PosCapabilities,
  PosContext,
  PosResult,
} from '../../src/verticals/delivery/contracts';

export interface FakePosOptions {
  provider?: string;
  /** Número de llamadas a pushOrder que fallan antes de responder ok (Infinity = siempre). */
  failTimes?: number;
  /** Si los fallos simulados son reintentables. */
  retryable?: boolean;
  /** Mensaje de error de los fallos simulados. */
  errorMessage?: string;
}

export interface FakePosCall {
  method: 'pushOrder' | 'cancelOrder';
  orderId?: string;
  externalId?: string;
  merchantId: string;
  secretResolved: boolean;
}

export class FakePosAdapter implements PosAdapter {
  readonly provider: string;
  readonly calls: FakePosCall[] = [];
  private failuresLeft: number;
  private readonly retryableFailures: boolean;
  private readonly errorMessage: string;
  private readonly accepted = new Map<string, string>();
  private seq = 0;

  constructor(opts: FakePosOptions = {}) {
    this.provider = opts.provider ?? 'fake';
    this.failuresLeft = opts.failTimes ?? 0;
    this.retryableFailures = opts.retryable ?? false;
    this.errorMessage = opts.errorMessage ?? 'fake pos unavailable';
  }

  static ok(provider = 'fake'): FakePosAdapter {
    return new FakePosAdapter({ provider });
  }

  static failing(provider = 'fake'): FakePosAdapter {
    return new FakePosAdapter({ provider, failTimes: Infinity, retryable: false });
  }

  static retryable(provider = 'fake'): FakePosAdapter {
    return new FakePosAdapter({ provider, failTimes: Infinity, retryable: true });
  }

  static failingThenOk(times: number, retryable = true, provider = 'fake'): FakePosAdapter {
    return new FakePosAdapter({ provider, failTimes: times, retryable });
  }

  capabilities(): PosCapabilities {
    return { pushOrder: true, cancelOrder: true, pullCatalog: false, statusUpdates: false };
  }

  pushCalls(): FakePosCall[] {
    return this.calls.filter((c) => c.method === 'pushOrder');
  }

  async pushOrder(
    ticket: KitchenTicket,
    ctx: PosContext,
  ): Promise<PosResult<{ externalId: string }>> {
    const secretResolved = ctx.resolveSecret() !== null;
    this.calls.push({
      method: 'pushOrder',
      orderId: ticket.orderId,
      merchantId: ctx.merchantId,
      secretResolved,
    });
    const existing = this.accepted.get(ticket.orderId);
    if (existing) return { ok: true, value: { externalId: existing } };
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return { ok: false, retryable: this.retryableFailures, error: this.errorMessage };
    }
    this.seq += 1;
    const externalId = `FAKE-${this.provider}-${this.seq}`;
    this.accepted.set(ticket.orderId, externalId);
    return { ok: true, value: { externalId } };
  }

  async cancelOrder(externalId: string, _reason: string, ctx: PosContext): Promise<PosResult> {
    this.calls.push({
      method: 'cancelOrder',
      externalId,
      merchantId: ctx.merchantId,
      secretResolved: ctx.resolveSecret() !== null,
    });
    const known = [...this.accepted.values()].includes(externalId);
    return known
      ? { ok: true, value: undefined }
      : { ok: false, retryable: false, error: 'unknown external order' };
  }
}
