import {
  DeliveryOrderLifecycleService,
  parseOrderNumber,
  toDeliveryStatus,
} from './delivery-order-lifecycle.service';
import { DELIVERY_TRANSITIONS, type DeliveryOrderStatus } from '../contracts';

const M = 'm1';
const actor = { actor: 'merchant' as const };

function setup(order: { id: string; orderCode: string; status: string } | null) {
  const state = { order };
  const prisma = {
    order: {
      findFirst: jest.fn(async ({ where }: { where: { orderCode: { equals: string } } }) =>
        state.order && state.order.orderCode.toLowerCase() === where.orderCode.equals.toLowerCase()
          ? state.order
          : null,
      ),
      findMany: jest.fn(async () => (state.order ? [state.order] : [])),
      findUnique: jest.fn(async () => state.order),
      update: jest.fn(async () => state.order),
      updateMany: jest.fn(async ({ data }: { data: { status: string } }) => {
        if (state.order) state.order = { ...state.order, status: data.status };
        return { count: 1 };
      }),
    },
  };
  const notifier = { notify: jest.fn().mockResolvedValue(true) };
  const svc = new DeliveryOrderLifecycleService(prisma as never, notifier as never);
  return { svc, prisma, notifier, state };
}

const order = (status: string) => ({ id: 'o1', orderCode: 'ORD-042', status });

describe('DeliveryOrderLifecycleService', () => {
  it('parseOrderNumber / toDeliveryStatus', () => {
    expect(parseOrderNumber('42')).toBe(42);
    expect(parseOrderNumber('ORD-0042')).toBe(42);
    expect(parseOrderNumber('abc')).toBeNull();
    expect(toDeliveryStatus('paid')).toBe('confirmed');
    expect(toDeliveryStatus('shipped')).toBe('on_the_way');
  });

  it.each(['42', 'ORD-42', 'ORD-0042', 'ord-042'])(
    'AC-16: acepta la referencia %s',
    async (ref) => {
      const { svc } = setup(order('confirmed'));
      const r = await svc.transition(M, ref, 'preparing', actor);
      expect(r).toMatchObject({
        ok: true,
        orderCode: 'ORD-042',
        from: 'confirmed',
        to: 'preparing',
      });
    },
  );

  it('no confunde 42 con ORD-142', async () => {
    const { svc } = setup({ id: 'o2', orderCode: 'ORD-142', status: 'confirmed' });
    expect(await svc.transition(M, '42', 'preparing', actor)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('NOT_FOUND si no existe', async () => {
    const { svc } = setup(null);
    expect(await svc.transition(M, '9', 'preparing', actor)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  const all = Object.keys(DELIVERY_TRANSITIONS) as DeliveryOrderStatus[];
  const pairs = all.flatMap((from) =>
    all.filter((to) => to !== from).map((to) => [from, to] as const),
  );

  it.each(pairs)('RN-14: %s → %s respeta la tabla', async (from, to) => {
    const { svc, notifier, prisma } = setup(order(from));
    const r = await svc.transition(M, '42', to, actor);
    if (DELIVERY_TRANSITIONS[from].includes(to)) {
      expect(r).toMatchObject({ ok: true, from, to, notified: true });
      expect(notifier.notify).toHaveBeenCalledWith('o1', to, { reason: undefined });
    } else {
      expect(r).toEqual({
        ok: false,
        reason: 'INVALID_TRANSITION',
        orderCode: 'ORD-042',
        status: from,
      });
      expect(notifier.notify).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    }
  });

  it('RN-14: mismo estado → idempotente sin notificar', async () => {
    const { svc, notifier } = setup(order('preparing'));
    const r = await svc.transition(M, '42', 'preparing', actor);
    expect(r).toEqual({ ok: true, idempotent: true, orderCode: 'ORD-042', status: 'preparing' });
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('AC-16: repetir el comando notifica solo una vez', async () => {
    const { svc, notifier } = setup(order('confirmed'));
    await svc.transition(M, '42', 'preparing', actor);
    await svc.transition(M, '42', 'preparing', actor);
    expect(notifier.notify).toHaveBeenCalledTimes(1);
  });

  it('cancelar setea cancelledAt y pasa el motivo al notifier', async () => {
    const { svc, prisma, notifier } = setup(order('confirmed'));
    await svc.transition(M, '42', 'cancelled', { actor: 'merchant', reason: 'sin gas' });
    const data = prisma.order.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('cancelled');
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(notifier.notify).toHaveBeenCalledWith('o1', 'cancelled', { reason: 'sin gas' });
  });

  it('preparando con minutos setea etaMinutes (RN-11)', async () => {
    const { svc, prisma } = setup(order('confirmed'));
    await svc.transition(M, '42', 'preparing', { actor: 'merchant', etaMinutes: 30 });
    expect(prisma.order.updateMany.mock.calls[0][0].data.etaMinutes).toBe(30);
    expect(prisma.order.updateMany.mock.calls[0][0].where).toMatchObject({
      merchantId: M,
      status: 'confirmed',
    });
  });

  it('estado legacy paid se trata como confirmed', async () => {
    const { svc } = setup(order('paid'));
    expect(await svc.transition(M, '42', 'preparing', actor)).toMatchObject({
      ok: true,
      from: 'confirmed',
    });
  });

  it('carrera: updateMany sin filas → relee el estado', async () => {
    const { svc, prisma, notifier, state } = setup(order('confirmed'));
    prisma.order.updateMany.mockImplementationOnce(async () => {
      state.order = order('preparing');
      return { count: 0 };
    });
    const r = await svc.transition(M, '42', 'preparing', actor);
    expect(r).toEqual({ ok: true, idempotent: true, orderCode: 'ORD-042', status: 'preparing' });
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
