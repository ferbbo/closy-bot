import { FakePosAdapter } from '../../../../../test/utils/fake-pos.adapter';
import { NoopPosAdapter } from '../adapters/noop.pos-adapter';
import { describePosAdapterContract } from './pos-adapter.contract-spec';

// AC-30: NoopPosAdapter y FakePosAdapter pasan el kit de contrato.
describePosAdapterContract('NoopPosAdapter', () => new NoopPosAdapter());
describePosAdapterContract('FakePosAdapter (ok)', () => FakePosAdapter.ok());
describePosAdapterContract('FakePosAdapter (failing)', () => FakePosAdapter.failing());
describePosAdapterContract('FakePosAdapter (retryable)', () => FakePosAdapter.retryable());
describePosAdapterContract('FakePosAdapter (1 failure then ok)', () =>
  FakePosAdapter.failingThenOk(1),
);
