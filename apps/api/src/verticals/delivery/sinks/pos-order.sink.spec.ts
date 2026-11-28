import { Logger } from '@nestjs/common';
import { FakePosAdapter } from '../../../../test/utils/fake-pos.adapter';
import type { PosAdapter, PosIntegrationConfig } from '../contracts';
import type { DeliveryConfigService } from '../config/delivery-config.service';
import type { BusinessMessengerService } from '../messaging/business-messenger.service';
import type { PrismaService } from '../../../persistence/prisma/prisma.service';
import { NoopPosAdapter } from '../pos/adapters/noop.pos-adapter';
import { PosAdapterRegistryService } from '../pos/pos-adapter.registry';
import { makeTicket } from '../pos/testing/pos-test.fixtures';
import { PosOrderSink } from './pos-order.sink';

const SECRET_REF = 'POS_SINK_SPEC_SECRET';
const SECRET_VALUE = 'sink-spec-secret-value-77';

describe('PosOrderSink', () => {
  let prisma: { order: { findFirst: jest.Mock; update: jest.Mock } };
  let messenger: { alertOperation: jest.Mock };
  let logs: jest.SpyInstance[];
  let posConfig: PosIntegrationConfig;

  function build(adapters: PosAdapter[]): PosOrderSink {
    const deliveryConfig = { get: jest.fn(async () => ({ pos: posConfig })) };
    return new PosOrderSink(
      prisma as unknown as PrismaService,
      deliveryConfig as unknown as DeliveryConfigService,
      new PosAdapterRegistryService(new NoopPosAdapter(), adapters),
      messenger as unknown as BusinessMessengerService,
    );
  }

  const lastUpdate = () => prisma.order.update.mock.calls.at(-1)?.[0];
  const logged = () => JSON.stringify(logs.flatMap((s) => s.mock.calls));

  beforeEach(() => {
    process.env[SECRET_REF] = SECRET_VALUE;
    posConfig = { provider: 'fake', enabled: true, settings: {}, secretRef: SECRET_REF };
    prisma = {
      order: {
        findFirst: jest.fn(async () => ({ id: 'order-1', posSyncStatus: null })),
        update: jest.fn(async () => ({})),
      },
    };
    messenger = { alertOperation: jest.fn(async () => ({ status: 'queued' })) };
    logs = (['log', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    delete process.env[SECRET_REF];
    logs.forEach((s) => s.mockRestore());
  });

  it("has name 'pos'", () => {
    expect(build([]).name).toBe('pos');
  });

  it("AC-30: provider 'none' → skipped without adapter calls", async () => {
    posConfig = { provider: 'none', enabled: false, settings: {}, secretRef: null };
    const fake = FakePosAdapter.ok('none');
    await build([fake]).publish('m-1', makeTicket('order-1'));
    expect(fake.calls).toHaveLength(0);
    expect(lastUpdate()).toEqual({
      where: { id: 'order-1' },
      data: { posProvider: 'none', posSyncStatus: 'skipped' },
    });
    expect(messenger.alertOperation).not.toHaveBeenCalled();
  });

  it('disabled or unregistered provider → skipped without calls', async () => {
    const fake = FakePosAdapter.ok('fake');
    posConfig = { ...posConfig, enabled: false };
    await build([fake]).publish('m-1', makeTicket('order-1'));
    posConfig = { ...posConfig, enabled: true, provider: 'siigo' };
    await build([fake]).publish('m-1', makeTicket('order-1'));
    expect(fake.calls).toHaveLength(0);
    expect(prisma.order.update).toHaveBeenCalledTimes(2);
    expect(lastUpdate().data.posSyncStatus).toBe('skipped');
  });

  it('AC-30: Fake ok → synced + posExternalId, secret resolved from env', async () => {
    const fake = FakePosAdapter.ok();
    await build([fake]).publish('m-1', makeTicket('order-1'));
    expect(fake.pushCalls()).toEqual([
      { method: 'pushOrder', orderId: 'order-1', merchantId: 'm-1', secretResolved: true },
    ]);
    expect(lastUpdate()).toEqual({
      where: { id: 'order-1' },
      data: { posProvider: 'fake', posSyncStatus: 'synced', posExternalId: 'FAKE-fake-1' },
    });
    expect(messenger.alertOperation).not.toHaveBeenCalled();
  });

  it('AC-30 / RN-23: Fake failing → failed + alerta_operacion to the manager, never throws', async () => {
    const fake = new FakePosAdapter({
      failTimes: Infinity,
      errorMessage: `auth rejected for ${SECRET_REF}=${SECRET_VALUE}`,
    });
    await expect(build([fake]).publish('m-1', makeTicket('order-1'))).resolves.toBeUndefined();
    expect(fake.pushCalls()).toHaveLength(1); // no reintentable → sin reintento
    expect(lastUpdate().data).toEqual({ posProvider: 'fake', posSyncStatus: 'failed' });
    expect(messenger.alertOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'm-1',
        orderId: 'order-1',
        orderCode: 'ORD-0042',
        dedupeKey: 'order:order-1:pos_failed',
      }),
    );
    expect(logged()).toContain('pos push failed');
    expect(logged()).not.toContain(SECRET_VALUE);
    expect(logged()).not.toContain(SECRET_REF);
  });

  it('retryable failure → exactly 1 retry, then synced', async () => {
    const fake = FakePosAdapter.failingThenOk(1, true);
    await build([fake]).publish('m-1', makeTicket('order-1'));
    expect(fake.pushCalls()).toHaveLength(2);
    expect(lastUpdate().data).toMatchObject({
      posSyncStatus: 'synced',
      posExternalId: 'FAKE-fake-1',
    });
    expect(messenger.alertOperation).not.toHaveBeenCalled();
  });

  it('retryable failure twice → 2 calls only, failed + alert', async () => {
    const fake = FakePosAdapter.retryable();
    await build([fake]).publish('m-1', makeTicket('order-1'));
    expect(fake.pushCalls()).toHaveLength(2);
    expect(lastUpdate().data.posSyncStatus).toBe('failed');
    expect(messenger.alertOperation).toHaveBeenCalledTimes(1);
  });

  it('idempotent: order already synced → no adapter call, no update', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', posSyncStatus: 'synced' });
    const fake = FakePosAdapter.ok();
    await build([fake]).publish('m-1', makeTicket('order-1'));
    expect(fake.calls).toHaveLength(0);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('adapter that throws is contained → failed + alert, publish resolves', async () => {
    const throwing: PosAdapter = {
      provider: 'fake',
      capabilities: () => ({
        pushOrder: true,
        cancelOrder: false,
        pullCatalog: false,
        statusUpdates: false,
      }),
      pushOrder: jest.fn(async () => {
        throw new Error('boom');
      }),
    };
    await expect(build([throwing]).publish('m-1', makeTicket('order-1'))).resolves.toBeUndefined();
    expect(lastUpdate().data.posSyncStatus).toBe('failed');
    expect(messenger.alertOperation).toHaveBeenCalledTimes(1);
  });

  it('infrastructure errors (DB) never escape publish', async () => {
    prisma.order.findFirst.mockRejectedValue(new Error('db down'));
    await expect(
      build([FakePosAdapter.ok()]).publish('m-1', makeTicket()),
    ).resolves.toBeUndefined();
  });

  it('order not found for merchant → no calls', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    const fake = FakePosAdapter.ok();
    await build([fake]).publish('m-1', makeTicket('order-x'));
    expect(fake.calls).toHaveLength(0);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-x', merchantId: 'm-1' } }),
    );
  });
});
