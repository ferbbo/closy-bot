import type { PosAdapter, PosResult } from '../../contracts';
import {
  CONTRACT_SECRET_REF,
  CONTRACT_SECRET_VALUE,
  makePosConfig,
  makePosContext,
  makeTicket,
} from './pos-test.fixtures';

/**
 * Kit de contrato del puerto POS (S3.4-T2, CONTRACTS §1). Todo adapter nuevo lo aplica en su
 * spec: `describePosAdapterContract('LoggroPosAdapter', () => new LoggroPosAdapter(httpFake))`.
 * `factory` debe devolver una instancia nueva y sin llamadas externas reales (HTTP falso).
 *
 * Verifica: capabilities coherentes con los métodos opcionales, `pushOrder` idempotente por
 * `ticket.orderId`, errores como `PosResult` tipado (sin throw) y que nunca expone `secretRef`
 * ni el valor del secreto en resultados o errores.
 * (No termina en `.spec.ts` para que jest no lo ejecute por sí solo.)
 */
export function describePosAdapterContract(name: string, factory: () => PosAdapter): void {
  describe(`PosAdapter contract: ${name}`, () => {
    const config = makePosConfig({ provider: 'contract' });
    const ctx = () => makePosContext(config, 'm-contract');

    function expectTypedResult(res: PosResult<unknown>): void {
      expect(res).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
      if (res.ok) {
        expect(res).toHaveProperty('value');
      } else {
        expect(typeof res.retryable).toBe('boolean');
        expect(typeof res.error).toBe('string');
      }
    }

    function expectNoSecrets(value: unknown): void {
      const serialized = JSON.stringify(value) ?? '';
      expect(serialized).not.toContain(CONTRACT_SECRET_VALUE);
      expect(serialized).not.toContain(CONTRACT_SECRET_REF);
    }

    it('has a non-empty provider and boolean capabilities', () => {
      const adapter = factory();
      expect(typeof adapter.provider).toBe('string');
      expect(adapter.provider.length).toBeGreaterThan(0);
      const caps = adapter.capabilities();
      for (const key of ['pushOrder', 'cancelOrder', 'pullCatalog', 'statusUpdates'] as const) {
        expect(typeof caps[key]).toBe('boolean');
      }
    });

    it('capabilities are coherent with the optional methods present', () => {
      const adapter = factory();
      const caps = adapter.capabilities();
      expect(caps.cancelOrder).toBe(typeof adapter.cancelOrder === 'function');
      expect(caps.pullCatalog).toBe(typeof adapter.pullCatalog === 'function');
      expect(caps.statusUpdates).toBe(typeof adapter.parseStatusEvent === 'function');
      expect(typeof adapter.pushOrder).toBe('function');
    });

    it('pushOrder is idempotent by ticket.orderId (same externalId on every ok)', async () => {
      const adapter = factory();
      const results: PosResult<{ externalId: string }>[] = [];
      for (let i = 0; i < 3; i++)
        results.push(await adapter.pushOrder(makeTicket('order-idem'), ctx()));
      const externalIds = results.flatMap((r) => (r.ok ? [r.value.externalId] : []));
      for (const id of externalIds) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
      expect(new Set(externalIds).size).toBeLessThanOrEqual(1);
    });

    it('pushOrder returns a typed PosResult and never throws', async () => {
      const adapter = factory();
      const res = await adapter.pushOrder(makeTicket('order-typed'), ctx());
      expectTypedResult(res);
      const bad = await adapter.pushOrder(makeTicket('order-bad', { lines: [] }), ctx());
      expectTypedResult(bad);
    });

    it('optional methods return typed results without throwing', async () => {
      const adapter = factory();
      if (adapter.cancelOrder) {
        expectTypedResult(await adapter.cancelOrder('unknown-external-id', 'contract', ctx()));
      }
      if (adapter.pullCatalog) expectTypedResult(await adapter.pullCatalog(ctx()));
      if (adapter.parseStatusEvent) {
        expect(() => adapter.parseStatusEvent?.({ garbage: true }, {}, ctx())).not.toThrow();
      }
    });

    it('never exposes secretRef nor the secret value in results or errors', async () => {
      const adapter = factory();
      const outputs: unknown[] = [
        await adapter.pushOrder(makeTicket('order-secret'), ctx()),
        await adapter.pushOrder(makeTicket('order-secret'), ctx()),
      ];
      if (adapter.cancelOrder) outputs.push(await adapter.cancelOrder('x', 'contract', ctx()));
      if (adapter.pullCatalog) outputs.push(await adapter.pullCatalog(ctx()));
      expectNoSecrets(outputs);
      expectNoSecrets(adapter.capabilities());
    });
  });
}
