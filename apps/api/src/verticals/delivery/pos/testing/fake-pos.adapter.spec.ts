import { FakePosAdapter } from '../../../../../test/utils/fake-pos.adapter';
import { CONTRACT_SECRET_VALUE, makePosContext, makeTicket } from './pos-test.fixtures';

describe('FakePosAdapter (test util)', () => {
  const ctx = makePosContext();

  it('ok → externalId, idempotent by orderId, records calls without secrets', async () => {
    const fake = FakePosAdapter.ok();
    const a = await fake.pushOrder(makeTicket('o-1'), ctx);
    const b = await fake.pushOrder(makeTicket('o-1'), ctx);
    const c = await fake.pushOrder(makeTicket('o-2'), ctx);
    expect(a).toEqual({ ok: true, value: { externalId: 'FAKE-fake-1' } });
    expect(b).toEqual(a);
    expect(c).toEqual({ ok: true, value: { externalId: 'FAKE-fake-2' } });
    expect(fake.pushCalls()).toHaveLength(3);
    expect(fake.calls[0]).toEqual({
      method: 'pushOrder',
      orderId: 'o-1',
      merchantId: 'm-1',
      secretResolved: true,
    });
    expect(JSON.stringify(fake.calls)).not.toContain(CONTRACT_SECRET_VALUE);
  });

  it('failing → non-retryable error every time', async () => {
    const fake = FakePosAdapter.failing();
    for (let i = 0; i < 3; i++) {
      expect(await fake.pushOrder(makeTicket(), ctx)).toEqual({
        ok: false,
        retryable: false,
        error: 'fake pos unavailable',
      });
    }
  });

  it('retryable → retryable error every time', async () => {
    const res = await FakePosAdapter.retryable().pushOrder(makeTicket(), ctx);
    expect(res).toMatchObject({ ok: false, retryable: true });
  });

  it('failingThenOk(n) → n failures then ok', async () => {
    const fake = FakePosAdapter.failingThenOk(2, true, 'loggro');
    expect((await fake.pushOrder(makeTicket(), ctx)).ok).toBe(false);
    expect((await fake.pushOrder(makeTicket(), ctx)).ok).toBe(false);
    expect(await fake.pushOrder(makeTicket(), ctx)).toEqual({
      ok: true,
      value: { externalId: 'FAKE-loggro-1' },
    });
  });

  it('cancelOrder → ok for a known externalId, typed error otherwise', async () => {
    const fake = FakePosAdapter.ok();
    await fake.pushOrder(makeTicket('o-1'), ctx);
    expect(await fake.cancelOrder('FAKE-fake-1', 'cliente', ctx)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await fake.cancelOrder('nope', 'cliente', ctx)).toMatchObject({
      ok: false,
      retryable: false,
    });
  });
});
