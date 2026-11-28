import { LifecycleCommandsService, parseLifecycleCommand } from './lifecycle-commands';
import {
  isDeliveryEnabledVia,
  resolveDeliveryCommandHandlers,
  DELIVERY_MERCHANT_COMMANDS,
} from './merchant-commands.token';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';

describe('parseLifecycleCommand', () => {
  it.each([
    ['preparando 42', { to: 'preparing', orderRef: '42' }],
    ['Preparando ORD-0042 30', { to: 'preparing', orderRef: 'ord-0042', etaMinutes: 30 }],
    ['preparando 42 25 min', { to: 'preparing', orderRef: '42', etaMinutes: 25 }],
    ['salio 42', { to: 'on_the_way', orderRef: '42' }],
    ['Salió #42', { to: 'on_the_way', orderRef: '42' }],
    ['entregado ORD-42', { to: 'delivered', orderRef: 'ord-42' }],
    ['cancelar 42 Sin gas', { to: 'cancelled', orderRef: '42', reason: 'Sin gas' }],
    ['cancelar 42', { to: 'cancelled', orderRef: '42' }],
  ])('%s', (text, expected) => {
    expect(parseLifecycleCommand(text)).toEqual(expected);
  });

  it.each([
    'enviado ORD-001',
    'confirmar ORD-001',
    'preparando',
    'salio',
    'hola',
    'entregado 42 ya',
  ])('no es comando de cocina: %s', (text) => expect(parseLifecycleCommand(text)).toBeNull());
});

describe('LifecycleCommandsService', () => {
  function setup(result: unknown, enabled = true) {
    const lifecycle = { transition: jest.fn().mockResolvedValue(result) };
    const flags = { isDeliveryEnabled: enabled };
    return { svc: new LifecycleCommandsService(lifecycle as never, flags as never), lifecycle };
  }

  it('AC-16: transición válida con actor merchant y ETA', async () => {
    const { svc, lifecycle } = setup({
      ok: true,
      orderId: 'o1',
      orderCode: 'ORD-042',
      from: 'confirmed',
      to: 'preparing',
      notified: true,
    });
    const reply = await svc.tryHandle('m1', 'preparando 42 30');
    expect(lifecycle.transition).toHaveBeenCalledWith('m1', '42', 'preparing', {
      actor: 'merchant',
      etaMinutes: 30,
      reason: undefined,
    });
    expect(reply).toBe('✅ Pedido ORD-042 en preparación (≈30 min). Cliente notificado.');
  });

  it('cancelar pasa el motivo', async () => {
    const { svc, lifecycle } = setup({
      ok: true,
      orderId: 'o1',
      orderCode: 'ORD-042',
      from: 'confirmed',
      to: 'cancelled',
      notified: false,
    });
    expect(await svc.tryHandle('m1', 'cancelar 42 sin gas')).toContain('cancelado');
    expect(lifecycle.transition.mock.calls[0][3].reason).toBe('sin gas');
  });

  it('idempotente → informativo', async () => {
    const { svc } = setup({
      ok: true,
      idempotent: true,
      orderCode: 'ORD-042',
      status: 'on_the_way',
    });
    expect(await svc.tryHandle('m1', 'salio 42')).toBe('ℹ️ El pedido ORD-042 ya estaba en camino.');
  });

  it('RN-14: inválida → mensaje accionable con el estado actual y el siguiente comando', async () => {
    const { svc } = setup({
      ok: false,
      reason: 'INVALID_TRANSITION',
      orderCode: 'ORD-042',
      status: 'confirmed',
    });
    const reply = await svc.tryHandle('m1', 'entregado 42');
    expect(reply).toContain('está confirmado');
    expect(reply).toContain("'preparando ORD-042'");
    expect(reply).toContain("'cancelar ORD-042'");
  });

  it('estado final → sin sugerencias', async () => {
    const { svc } = setup({
      ok: false,
      reason: 'INVALID_TRANSITION',
      orderCode: 'ORD-042',
      status: 'delivered',
    });
    expect(await svc.tryHandle('m1', 'cancelar 42')).toContain('Ya no admite cambios');
  });

  it('NOT_FOUND → accionable', async () => {
    const { svc } = setup({ ok: false, reason: 'NOT_FOUND' });
    expect(await svc.tryHandle('m1', 'salio 99')).toContain('No encontré el pedido 99');
  });

  it('texto ajeno o flag apagado → null sin tocar el lifecycle', async () => {
    const a = setup({});
    expect(await a.svc.tryHandle('m1', 'enviado ORD-001')).toBeNull();
    const b = setup({}, false);
    expect(await b.svc.tryHandle('m1', 'salio 42')).toBeNull();
    expect(a.lifecycle.transition).not.toHaveBeenCalled();
    expect(b.lifecycle.transition).not.toHaveBeenCalled();
  });
});

describe('merchant-commands.token helpers', () => {
  const ref = (map: Map<unknown, unknown>) =>
    ({
      get: (token: unknown) => {
        if (!map.has(token)) throw new Error('not found');
        return map.get(token);
      },
    }) as never;

  it('sin moduleRef o sin providers → false / []', () => {
    expect(isDeliveryEnabledVia(undefined)).toBe(false);
    expect(isDeliveryEnabledVia(ref(new Map()))).toBe(false);
    expect(resolveDeliveryCommandHandlers(ref(new Map()))).toEqual([]);
  });

  it('resuelve flag y handlers válidos', () => {
    const h = { tryHandle: jest.fn() };
    const m = new Map<unknown, unknown>([
      [FeatureFlagsService, { isDeliveryEnabled: true }],
      [DELIVERY_MERCHANT_COMMANDS, [h, {}]],
    ]);
    expect(isDeliveryEnabledVia(ref(m))).toBe(true);
    expect(resolveDeliveryCommandHandlers(ref(m))).toEqual([h]);
  });
});
