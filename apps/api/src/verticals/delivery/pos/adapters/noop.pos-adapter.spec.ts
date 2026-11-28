import { NoopPosAdapter } from './noop.pos-adapter';
import { makePosContext, makeTicket } from '../testing/pos-test.fixtures';

describe('NoopPosAdapter', () => {
  const adapter = new NoopPosAdapter();

  it("is provider 'none' and declares no capabilities", () => {
    expect(adapter.provider).toBe('none');
    expect(adapter.capabilities()).toEqual({
      pushOrder: false,
      cancelOrder: false,
      pullCatalog: false,
      statusUpdates: false,
    });
  });

  it('pushOrder → ok with a deterministic externalId and never resolves the secret', async () => {
    const ctx = makePosContext();
    const resolveSecret = jest.fn(ctx.resolveSecret);
    const res = await adapter.pushOrder(makeTicket('o-9'), { ...ctx, resolveSecret });
    expect(res).toEqual({ ok: true, value: { externalId: 'noop:o-9' } });
    expect(resolveSecret).not.toHaveBeenCalled();
  });
});
