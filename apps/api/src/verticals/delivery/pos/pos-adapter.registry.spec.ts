import { Logger } from '@nestjs/common';
import { FakePosAdapter } from '../../../../test/utils/fake-pos.adapter';
import { NoopPosAdapter } from './adapters/noop.pos-adapter';
import { PosAdapterRegistryService } from './pos-adapter.registry';
import { CONTRACT_SECRET_REF, makePosConfig } from './testing/pos-test.fixtures';

describe('PosAdapterRegistryService', () => {
  const noop = new NoopPosAdapter();
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('resolves the registered adapter by provider when enabled', () => {
    const fake = FakePosAdapter.ok('loggro');
    const registry = new PosAdapterRegistryService(noop, [fake]);
    expect(registry.resolve(makePosConfig({ provider: 'loggro' }))).toBe(fake);
    expect(registry.registeredProviders()).toEqual(['loggro']);
  });

  it("provider 'none' → Noop", () => {
    const registry = new PosAdapterRegistryService(noop, [FakePosAdapter.ok('none')]);
    expect(registry.resolve(makePosConfig({ provider: 'none', enabled: true }))).toBe(noop);
  });

  it('disabled provider → Noop without warning', () => {
    const registry = new PosAdapterRegistryService(noop, [FakePosAdapter.ok('loggro')]);
    expect(registry.resolve(makePosConfig({ provider: 'loggro', enabled: false }))).toBe(noop);
    expect(warn).not.toHaveBeenCalled();
  });

  it('missing config or no POS_ADAPTERS provider → Noop', () => {
    const registry = new PosAdapterRegistryService(noop, undefined);
    expect(registry.resolve(undefined)).toBe(noop);
    expect(registry.resolve(makePosConfig())).toBe(noop);
  });

  it('unknown provider → Noop with a single warning that never includes secretRef or settings', () => {
    const registry = new PosAdapterRegistryService(noop, []);
    const cfg = makePosConfig({ provider: 'siigo', settings: { storeId: 'store-secret-ish' } });
    expect(registry.resolve(cfg)).toBe(noop);
    expect(registry.resolve(cfg)).toBe(noop);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('siigo');
    expect(msg).not.toContain(CONTRACT_SECRET_REF);
    expect(msg).not.toContain('store-secret-ish');
  });

  it('duplicate providers keep the first adapter', () => {
    const first = FakePosAdapter.ok('loggro');
    const registry = new PosAdapterRegistryService(noop, [first, FakePosAdapter.ok('loggro')]);
    expect(registry.resolve(makePosConfig({ provider: 'loggro' }))).toBe(first);
  });
});
