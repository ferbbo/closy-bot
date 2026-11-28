import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { buildRestauranteDefaults } from '../../config/restaurante.defaults';
import type { DeliveryOrderLifecycle, DeliveryTurnContext } from '../../contracts';
import { OrderTools, remainingEtaMinutes } from './order.tools';

const NOW = new Date('2026-11-28T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000);
const order = (overrides: Record<string, unknown> = {}) => ({
  orderCode: 'ORD-0042',
  status: 'confirmed',
  etaMinutes: 40,
  confirmedAt: minutesAgo(15),
  createdAt: minutesAgo(16),
  totalAmount: new Decimal(37000),
  ...overrides,
});

describe('OrderTools (S4.2-T1)', () => {
  let prisma: { order: { findFirst: jest.Mock; findMany: jest.Mock } };
  let lifecycle: { transition: jest.Mock };
  let tools: OrderTools;
  let ctx: DeliveryTurnContext;

  beforeEach(() => {
    prisma = { order: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() } };
    lifecycle = {
      transition: jest.fn().mockResolvedValue({
        ok: true,
        orderId: 'o-1',
        orderCode: 'ORD-0042',
        from: 'confirmed',
        to: 'cancelled',
        notified: true,
      }),
    };
    tools = new OrderTools(
      prisma as unknown as PrismaService,
      lifecycle as unknown as DeliveryOrderLifecycle,
    );
    ctx = {
      merchantId: 'm-1',
      customerId: 'c-1',
      conversationId: 'conv-1',
      customerPhone: '+570000000',
      text: '',
      config: buildRestauranteDefaults(),
      now: NOW,
      seenVariantIds: new Set(),
    };
  });

  const run = (name: string, args: Record<string, unknown> = {}) =>
    tools.handlers()[name](args, ctx);

  it('exposes definitions matching handlers', () => {
    expect(tools.definitions.map((d) => d.name).sort()).toEqual(
      Object.keys(tools.handlers()).sort(),
    );
  });

  describe('estado_pedido (AC-17)', () => {
    it('AC-17: returns code, status, remaining ETA and total of the latest active order', async () => {
      prisma.order.findFirst.mockResolvedValue(order());
      const res = await run('estado_pedido');
      expect(res).toEqual({
        ok: true,
        data: { codigo: 'ORD-0042', estado: 'confirmed', etaRestanteMin: 25, total: 37000 },
      });
      const where = prisma.order.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ merchantId: 'm-1', customerId: 'c-1' });
      expect(where.status.in).toEqual(['pending_payment', 'confirmed', 'preparing', 'on_the_way']);
      expect(prisma.order.findFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    });

    it('AC-17: no active orders → sinPedidos', async () => {
      expect(await run('estado_pedido')).toEqual({ ok: true, data: { sinPedidos: true } });
    });

    it('never throws on DB error', async () => {
      prisma.order.findFirst.mockRejectedValue(new Error('db down'));
      expect(await run('estado_pedido')).toEqual({ ok: false, error: 'ORDER_ERROR' });
    });
  });

  describe('remainingEtaMinutes', () => {
    it('uses createdAt when not confirmed, floors at 0, null without eta', () => {
      expect(remainingEtaMinutes(order({ confirmedAt: null }) as never, NOW)).toBe(24);
      expect(remainingEtaMinutes(order({ confirmedAt: minutesAgo(90) }) as never, NOW)).toBe(0);
      expect(remainingEtaMinutes(order({ etaMinutes: null }) as never, NOW)).toBeNull();
    });
  });

  describe('cancelar_pedido (AC-18, RN-16)', () => {
    it('AC-18: confirmed → lifecycle.transition cancelled with actor customer', async () => {
      prisma.order.findFirst.mockResolvedValue(order());
      const res = await run('cancelar_pedido', { motivo: 'me equivoqué' });
      expect(lifecycle.transition).toHaveBeenCalledWith('m-1', 'ORD-0042', 'cancelled', {
        actor: 'customer',
        reason: 'me equivoqué',
      });
      expect(res).toEqual({ ok: true, data: { codigo: 'ORD-0042', estado: 'cancelled' } });
    });

    it('RN-16: pending_payment is cancellable', async () => {
      prisma.order.findFirst.mockResolvedValue(order({ status: 'pending_payment' }));
      expect((await run('cancelar_pedido')).ok).toBe(true);
      expect(lifecycle.transition).toHaveBeenCalled();
    });

    it.each(['preparing', 'on_the_way'])(
      'AC-18: %s → CANNOT_CANCEL with ofrecerHumano, no transition',
      async (status) => {
        prisma.order.findFirst.mockResolvedValue(order({ status }));
        const res = await run('cancelar_pedido');
        expect(res).toEqual({
          ok: false,
          error: 'CANNOT_CANCEL',
          data: { codigo: 'ORD-0042', estado: status, ofrecerHumano: true },
        });
        expect(lifecycle.transition).not.toHaveBeenCalled();
      },
    );

    it('with codigo: finds own order by number regardless of padding', async () => {
      prisma.order.findMany.mockResolvedValue([order({ orderCode: 'ORD-0041' }), order()]);
      const res = await run('cancelar_pedido', { codigo: '42' });
      expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
        merchantId: 'm-1',
        customerId: 'c-1',
      });
      expect(lifecycle.transition).toHaveBeenCalledWith(
        'm-1',
        'ORD-0042',
        'cancelled',
        expect.objectContaining({ actor: 'customer' }),
      );
      expect(res.ok).toBe(true);
    });

    it('unknown codigo → ORDER_NOT_FOUND; no active order → NO_ACTIVE_ORDER', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      expect(await run('cancelar_pedido', { codigo: 'ORD-9' })).toEqual({
        ok: false,
        error: 'ORDER_NOT_FOUND',
      });
      expect(await run('cancelar_pedido')).toEqual({ ok: false, error: 'NO_ACTIVE_ORDER' });
      expect(lifecycle.transition).not.toHaveBeenCalled();
    });

    it('race: lifecycle INVALID_TRANSITION → CANNOT_CANCEL + ofrecerHumano', async () => {
      prisma.order.findFirst.mockResolvedValue(order());
      lifecycle.transition.mockResolvedValue({
        ok: false,
        reason: 'INVALID_TRANSITION',
        orderCode: 'ORD-0042',
        status: 'preparing',
      });
      expect(await run('cancelar_pedido')).toEqual({
        ok: false,
        error: 'CANNOT_CANCEL',
        data: { codigo: 'ORD-0042', estado: 'preparing', ofrecerHumano: true },
      });
    });

    it('already cancelled order by code → idempotent ok', async () => {
      prisma.order.findMany.mockResolvedValue([order({ status: 'cancelled' })]);
      const res = await run('cancelar_pedido', { codigo: 'ORD-0042' });
      expect(res).toEqual({
        ok: true,
        data: { codigo: 'ORD-0042', estado: 'cancelled', yaCancelado: true },
      });
      expect(lifecycle.transition).not.toHaveBeenCalled();
    });
  });
});
