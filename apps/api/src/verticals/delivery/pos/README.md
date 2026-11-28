# Puerto POS (Ports & Adapters)

Solo `sinks/pos-order.sink.ts` (`PosOrderSink`) habla con un `PosAdapter` (CLAUDE.md regla 7).
El agente, el checkout y el ciclo de vida nunca llaman a un POS. Contratos: `../contracts.ts`
(Puerto POS) · SPEC RN-23 / AC-30 · DECISIONS D-009.

| Pieza | Archivo |
|---|---|
| Registry (`provider` → adapter, fallback Noop) | `pos-adapter.registry.ts` |
| Adapter por defecto (`provider: 'none'`) | `adapters/noop.pos-adapter.ts` |
| Kit de contrato | `testing/pos-adapter.contract-spec.ts` |
| Fake para tests | `apps/api/test/utils/fake-pos.adapter.ts` |
| Providers a cablear | `pos.providers.ts` |

Comportamiento del sink: `none` / deshabilitado / desconocido → `posSyncStatus='skipped'` sin
llamadas · ok → `synced` + `posExternalId` · error `retryable` → 1 reintento · fallo → `failed` +
`alerta_operacion` al encargado (`dedupeKey order:{id}:pos_failed`). Nunca lanza ni bloquea la comanda.

## Cómo agregar un POS (5 pasos)

1. **Adapter**: crea `adapters/<proveedor>.pos-adapter.ts` con una clase `@Injectable()` que
   implemente `PosAdapter` (esqueleto abajo). `provider` = el valor de `DeliveryConfig.pos.provider`.
2. **Contrato del proveedor**: `pushOrder` idempotente por `ticket.orderId` (usa el `orderId` como
   referencia externa / idempotency key del POS). Nunca lances: devuelve `PosResult` con
   `retryable: true` solo para timeouts, 429 y 5xx. `capabilities()` debe reflejar exactamente los
   métodos opcionales que implementas.
3. **Secretos**: la credencial va en una variable de entorno cuyo NOMBRE es `pos.secretRef`
   (declárala en `env.validation.ts` y `.env.example`). Léela solo con `ctx.resolveSecret()` y no la
   pongas en logs, errores ni resultados. Los no secretos (storeId, branchId) van en `pos.settings`.
4. **Registro**: agrega la clase a `providers` y al array de `POS_ADAPTERS` en `delivery.module.ts`
   (`{ provide: POS_ADAPTERS, useFactory: (a: LoggroPosAdapter) => [a], inject: [LoggroPosAdapter] }`).
5. **Tests**: en `adapters/<proveedor>.pos-adapter.spec.ts` llama a
   `describePosAdapterContract('<Proveedor>PosAdapter', () => new XPosAdapter(httpFalso))` y agrega
   casos propios (mapeo del ticket, errores HTTP). Nunca llames al POS real en tests.

## Esqueleto

```ts
import { Injectable } from '@nestjs/common';
import type { KitchenTicket, PosAdapter, PosCapabilities, PosContext, PosResult } from '../../contracts';

@Injectable()
export class AcmePosAdapter implements PosAdapter {
  readonly provider = 'acme';

  constructor(private readonly client: AcmeHttpClient) {} // cliente HTTP propio, falso en tests

  capabilities(): PosCapabilities {
    return { pushOrder: true, cancelOrder: false, pullCatalog: false, statusUpdates: false };
  }

  async pushOrder(ticket: KitchenTicket, ctx: PosContext): Promise<PosResult<{ externalId: string }>> {
    const token = ctx.resolveSecret();
    if (!token) return { ok: false, retryable: false, error: 'missing POS credential' };
    try {
      // POST idempotente usando ticket.orderId como referencia externa; storeId en ctx.config.settings
      const externalId = await this.client.createOrder(ticket, ctx.config.settings, token);
      return { ok: true, value: { externalId } };
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      return { ok: false, retryable: status === 429 || status >= 500 || status === 0, error: `acme http ${status}` };
    }
  }
}
```
