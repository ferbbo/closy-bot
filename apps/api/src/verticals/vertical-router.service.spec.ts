import { VerticalRouterService } from './vertical-router.service';
import type { VerticalContext, VerticalHandler, VerticalResult } from './vertical.types';

const ctx: VerticalContext = {
  merchant: { id: 'm1', name: 'Burger Barrio', industry: 'restaurante', playbookConfig: null },
  customer: { id: 'c1', phone: '+573000000101' },
  conversation: { id: 'conv1', metadata: null },
  input: { messageId: 'wamid.1', text: 'hola', timestamp: new Date('2026-11-27T20:00:00Z') },
};

function handler(
  name: string,
  canHandle: boolean | Error,
  result: VerticalResult | null | Error,
): VerticalHandler & { handle: jest.Mock; canHandle: jest.Mock } {
  return {
    name,
    canHandle: jest.fn(async () => {
      if (canHandle instanceof Error) throw canHandle;
      return canHandle;
    }),
    handle: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('VerticalRouterService', () => {
  let router: VerticalRouterService;
  const ok: VerticalResult = { response: 'Hola 👋', shouldSend: true, intent: 'DELIVERY_ORDER' };

  beforeEach(() => {
    router = new VerticalRouterService();
  });

  it('returns null when no handlers are registered (legacy path)', async () => {
    await expect(router.tryHandle(ctx)).resolves.toBeNull();
  });

  it('delegates to the first handler that can handle and returns its result', async () => {
    const a = handler('a', false, ok);
    const b = handler('b', true, ok);
    router.register(a);
    router.register(b);

    await expect(router.tryHandle(ctx)).resolves.toEqual(ok);
    expect(a.handle).not.toHaveBeenCalled();
    expect(b.handle).toHaveBeenCalledWith(ctx);
  });

  it('falls through to the next handler when a handler returns null', async () => {
    const a = handler('a', true, null);
    const b = handler('b', true, ok);
    router.register(a);
    router.register(b);

    await expect(router.tryHandle(ctx)).resolves.toEqual(ok);
  });

  it('returns null when no handler can handle', async () => {
    const a = handler('a', false, ok);
    router.register(a);
    await expect(router.tryHandle(ctx)).resolves.toBeNull();
    expect(a.handle).not.toHaveBeenCalled();
  });

  it('returns null (legacy fallback) when a handler throws', async () => {
    router.register(handler('boom', true, new Error('db down')));
    await expect(router.tryHandle(ctx)).resolves.toBeNull();
  });

  it('returns null when canHandle throws', async () => {
    router.register(handler('boom', new Error('flag error'), ok));
    await expect(router.tryHandle(ctx)).resolves.toBeNull();
  });

  it('ignores duplicate registrations by name', () => {
    router.register(handler('delivery', true, ok));
    router.register(handler('delivery', true, ok));
    expect(router.registeredHandlers).toEqual(['delivery']);
  });
});
