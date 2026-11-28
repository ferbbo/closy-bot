import { DeliveryConfigService } from '../../config/delivery-config.service';
import { buildRestauranteDefaults } from '../../config/restaurante.defaults';
import type { DeliveryConfig, DeliveryTurnContext, ToolHandler } from '../../contracts';
import type { PrismaService } from '../../../../persistence/prisma/prisma.service';
import {
  DEFAULT_OPENING_HOURS_GUARDED_TOOLS,
  OpeningHoursGuard,
  withOpeningHoursGuard,
} from './opening-hours.guard';

const ALL_TOOLS = [
  'buscar_producto',
  'ver_menu',
  'consultar_negocio',
  'ver_carrito',
  'agregar_al_carrito',
  'quitar_del_carrito',
  'fijar_entrega',
  'cotizar_domicilio',
  'fijar_pago',
  'resumen_pedido',
  'confirmar_pedido',
];
const READ_TOOLS = ['buscar_producto', 'ver_menu', 'consultar_negocio', 'ver_carrito'];

// Martes 2026-12-01 en America/Bogota (UTC-5): 12:00 local = 17:00Z; 23:00 local = 04:00Z del miércoles
const TUESDAY_NOON = new Date('2026-12-01T17:00:00Z');
const TUESDAY_LATE = new Date('2026-12-02T04:00:00Z');

function cfg(partial: Partial<DeliveryConfig> = {}): DeliveryConfig {
  return {
    ...buildRestauranteDefaults(),
    timezone: 'America/Bogota',
    openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day: day as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      open: '11:00',
      close: '22:00',
    })),
    ...partial,
  };
}

function ctx(config: DeliveryConfig, now: Date): DeliveryTurnContext {
  return {
    merchantId: 'm1',
    customerId: 'c1',
    conversationId: 'conv1',
    customerPhone: '+570000000000',
    text: 'x',
    config,
    now,
    seenVariantIds: new Set(),
  };
}

function registry(): { handlers: Record<string, ToolHandler>; spies: Record<string, jest.Mock> } {
  const spies: Record<string, jest.Mock> = {};
  const handlers: Record<string, ToolHandler> = {};
  for (const name of ALL_TOOLS) {
    spies[name] = jest.fn().mockResolvedValue({ ok: true, data: { name } });
    handlers[name] = spies[name] as unknown as ToolHandler;
  }
  return { handlers, spies };
}

const guard = new OpeningHoursGuard(new DeliveryConfigService({} as PrismaService));

describe('OpeningHoursGuard (RN-07)', () => {
  it('lista por defecto = herramientas de carrito y checkout', () => {
    expect([...DEFAULT_OPENING_HOURS_GUARDED_TOOLS]).toEqual(
      ALL_TOOLS.filter((t) => !READ_TOOLS.includes(t)),
    );
  });

  it('abierto → todas las herramientas ejecutan su handler', async () => {
    const { handlers, spies } = registry();
    const wrapped = guard.wrap(handlers);
    for (const name of ALL_TOOLS) {
      await expect(wrapped[name]({}, ctx(cfg(), TUESDAY_NOON))).resolves.toEqual({
        ok: true,
        data: { name },
      });
      expect(spies[name]).toHaveBeenCalledTimes(1);
    }
  });

  it('AC-10: fuera de horario → STORE_CLOSED con proximaApertura y sin ejecutar (no se crea carrito)', async () => {
    const { handlers, spies } = registry();
    const wrapped = guard.wrap(handlers);
    for (const name of DEFAULT_OPENING_HOURS_GUARDED_TOOLS) {
      const res = await wrapped[name]({ variantId: 'v1', cantidad: 1 }, ctx(cfg(), TUESDAY_LATE));
      expect(res).toEqual({
        ok: false,
        error: 'STORE_CLOSED',
        data: { proximaApertura: { day: 3, time: '11:00' }, temporalmenteCerrado: false },
      });
      expect(spies[name]).not.toHaveBeenCalled();
    }
  });

  it('AC-10: fuera de horario las de lectura ("menú") sí responden', async () => {
    const { handlers, spies } = registry();
    const wrapped = guard.wrap(handlers);
    for (const name of READ_TOOLS) {
      const res = await wrapped[name]({}, ctx(cfg(), TUESDAY_LATE));
      expect(res.ok).toBe(true);
      expect(spies[name]).toHaveBeenCalledTimes(1);
    }
  });

  it('AC-10: temporarilyClosed en horario → STORE_CLOSED sin próxima apertura', async () => {
    const { handlers, spies } = registry();
    const wrapped = guard.wrap(handlers);
    const res = await wrapped.agregar_al_carrito(
      {},
      ctx(cfg({ temporarilyClosed: true }), TUESDAY_NOON),
    );
    expect(res).toEqual({
      ok: false,
      error: 'STORE_CLOSED',
      data: { proximaApertura: null, temporalmenteCerrado: true },
    });
    expect(spies.agregar_al_carrito).not.toHaveBeenCalled();
    expect(
      (await wrapped.ver_menu({}, ctx(cfg({ temporarilyClosed: true }), TUESDAY_NOON))).ok,
    ).toBe(true);
  });

  it('temporarilyClosed se respeta aunque isOpen inyectado diga abierto', async () => {
    const { handlers, spies } = registry();
    const wrapped = withOpeningHoursGuard(handlers, () => ({ open: true }));
    const res = await wrapped.fijar_pago({}, ctx(cfg({ temporarilyClosed: true }), TUESDAY_NOON));
    expect(res.error).toBe('STORE_CLOSED');
    expect(spies.fijar_pago).not.toHaveBeenCalled();
  });

  it('lista configurable: solo bloquea las indicadas y conserva handlers desconocidos', async () => {
    const { handlers, spies } = registry();
    const extra = jest.fn().mockResolvedValue({ ok: true });
    const wrapped = withOpeningHoursGuard(
      { ...handlers, pedir_humano: extra as unknown as ToolHandler },
      () => ({ open: false }),
      ['agregar_al_carrito'],
    );
    expect((await wrapped.agregar_al_carrito({}, ctx(cfg(), TUESDAY_LATE))).error).toBe(
      'STORE_CLOSED',
    );
    expect((await wrapped.fijar_pago({}, ctx(cfg(), TUESDAY_LATE))).ok).toBe(true);
    expect((await wrapped.pedir_humano({}, ctx(cfg(), TUESDAY_LATE))).ok).toBe(true);
    expect(spies.fijar_pago).toHaveBeenCalledTimes(1);
    expect(Object.keys(wrapped)).toHaveLength(ALL_TOOLS.length + 1);
  });

  it('evalúa el horario en cada llamada con ctx.now', async () => {
    const isOpen = jest
      .fn()
      .mockReturnValueOnce({ open: true })
      .mockReturnValueOnce({ open: false });
    const { handlers } = registry();
    const wrapped = withOpeningHoursGuard(handlers, isOpen);
    const c = cfg();
    expect((await wrapped.agregar_al_carrito({}, ctx(c, TUESDAY_NOON))).ok).toBe(true);
    expect((await wrapped.agregar_al_carrito({}, ctx(c, TUESDAY_LATE))).ok).toBe(false);
    expect(isOpen).toHaveBeenNthCalledWith(1, c, TUESDAY_NOON);
    expect(isOpen).toHaveBeenNthCalledWith(2, c, TUESDAY_LATE);
  });
});
