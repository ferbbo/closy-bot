import { CustomerStatusNotifierService } from './customer-status-notifier.service';
import type { DeliveryOrderStatus } from '../contracts';

const ORDER = {
  id: 'o1',
  merchantId: 'm1',
  orderCode: 'ORD-042',
  customerName: 'Ana',
  customerPhone: '+573001112233',
  totalAmount: 28000,
  etaMinutes: 30,
  merchant: { name: 'Burger Barrio' },
};

function setup(order: unknown = ORDER) {
  const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) } };
  const messenger = {
    notify: jest.fn().mockResolvedValue({ status: 'queued', channel: 'template', outboxId: 'x' }),
  };
  const svc = new CustomerStatusNotifierService(prisma as never, messenger as never);
  return { svc, prisma, messenger };
}

describe('CustomerStatusNotifierService', () => {
  const cases: Array<[DeliveryOrderStatus, string, string[]]> = [
    [
      'confirmed',
      'pedido_confirmado',
      ['customer_name', 'order_code', 'merchant_name', 'total', 'eta_minutes'],
    ],
    ['preparing', 'pedido_en_preparacion', ['order_code', 'merchant_name', 'eta_minutes']],
    ['on_the_way', 'pedido_en_camino', ['order_code', 'merchant_name']],
    ['delivered', 'pedido_entregado', ['order_code', 'merchant_name']],
    ['cancelled', 'pedido_cancelado', ['order_code', 'merchant_name', 'reason']],
  ];

  it.each(cases)(
    'AC-34: %s → 1 notify con plantilla %s, params sin saltos de línea y dedupeKey',
    async (status, template, keys) => {
      const { svc, messenger } = setup();
      const ok = await svc.notify('o1', status, { reason: 'sin\ngas' });
      expect(ok).toBe(true);
      expect(messenger.notify).toHaveBeenCalledTimes(1);
      const req = messenger.notify.mock.calls[0][0];
      expect(req.template).toBe(template);
      expect(req.dedupeKey).toBe(`order:o1:status:${status}`);
      expect(req.orderId).toBe('o1');
      expect(Object.keys(req.params).sort()).toEqual([...keys].sort());
      for (const v of Object.values(req.params)) expect(String(v)).not.toMatch(/\n/);
      expect(req.freeText).toEqual(expect.any(String));
      expect(req.params.order_code).toBe('ORD-042');
      expect(req.params.merchant_name).toBe('Burger Barrio');
    },
  );

  it('preparing usa etaMinutes de la BD y confirmed formatea el total', async () => {
    const { svc, messenger } = setup();
    await svc.notify('o1', 'preparing');
    expect(messenger.notify.mock.calls[0][0].params.eta_minutes).toBe('30');
    await svc.notify('o1', 'confirmed');
    expect(messenger.notify.mock.calls[1][0].params.total).toBe('$28.000');
  });

  it('cancelled sin motivo usa texto por defecto', async () => {
    const { svc, messenger } = setup();
    await svc.notify('o1', 'cancelled');
    expect(messenger.notify.mock.calls[0][0].params.reason).toBe('sin motivo informado');
  });

  it('pending_payment no notifica', async () => {
    const { svc, messenger } = setup();
    expect(await svc.notify('o1', 'pending_payment')).toBe(false);
    expect(messenger.notify).not.toHaveBeenCalled();
  });

  it('skipped → false', async () => {
    const { svc, messenger } = setup();
    messenger.notify.mockResolvedValue({ status: 'skipped', reason: 'DUPLICATE' });
    expect(await svc.notify('o1', 'delivered')).toBe(false);
  });

  it('nunca lanza (error de BD o messenger) y pedido inexistente → false', async () => {
    const { svc, messenger, prisma } = setup();
    messenger.notify.mockRejectedValue(new Error('boom'));
    await expect(svc.notify('o1', 'delivered')).resolves.toBe(false);
    prisma.order.findUnique.mockRejectedValue(new Error('db'));
    await expect(svc.notify('o1', 'delivered')).resolves.toBe(false);
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.notify('o1', 'delivered')).resolves.toBe(false);
  });
});
