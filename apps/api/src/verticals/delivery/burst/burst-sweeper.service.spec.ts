import { BurstSweeperService } from './burst-sweeper.service';
import { BurstBufferService } from './burst-buffer.service';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';

describe('BurstSweeperService (S5.1-T2)', () => {
  let burst: { findDue: jest.Mock; flush: jest.Mock };
  const build = (isDeliveryEnabled = true) =>
    new BurstSweeperService(
      burst as unknown as BurstBufferService,
      { isDeliveryEnabled } as FeatureFlagsService,
    );

  beforeEach(() => {
    burst = {
      findDue: jest.fn().mockResolvedValue(['c1', 'c2']),
      // c2 ya lo reclamó el timer (compare-and-set) → false
      flush: jest.fn((id: string) => Promise.resolve(id === 'c1')),
    };
  });

  it('flushes every expired buffer persisted in metadata (restart-safe)', async () => {
    await expect(build().sweep()).resolves.toBe(1);
    expect(burst.flush).toHaveBeenCalledWith('c1', false);
    expect(burst.flush).toHaveBeenCalledWith('c2', false);
  });

  it('does not touch the DB with the delivery flag off (RN-21)', async () => {
    await expect(build(false).sweep()).resolves.toBe(0);
    expect(burst.findDue).not.toHaveBeenCalled();
  });

  it('skips a sweep while the previous one is still running and never throws', async () => {
    let release: (ids: string[]) => void = () => undefined;
    burst.findDue.mockReturnValueOnce(new Promise<string[]>((r) => (release = r)));
    const sweeper = build();
    const first = sweeper.sweep();
    await expect(sweeper.sweep()).resolves.toBe(0);
    release(['c1']);
    await expect(first).resolves.toBe(1);

    burst.findDue.mockRejectedValueOnce(new Error('db down'));
    await expect(sweeper.handleInterval()).resolves.toBeUndefined();
  });
});
