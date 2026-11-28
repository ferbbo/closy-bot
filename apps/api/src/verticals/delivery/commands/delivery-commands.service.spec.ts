import { Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { DeliveryConfigService } from '../config/delivery-config.service';
import {
  DELIVERY_HELP_TEXT,
  DeliveryCommandsService,
  STOCK_CHOICE_TTL_MS,
} from './delivery-commands.service';

const VARIANTS = [
  { id: 'v-coca-400', name: '400 ml', product: { name: 'Coca-Cola' } },
  { id: 'v-coca-15', name: '1.5 L', product: { name: 'Coca-Cola' } },
  { id: 'v-burger', name: 'Única', product: { name: 'Hamburguesa Clásica' } },
  { id: 'v-perro', name: 'Sencillo', product: { name: 'Perro Caliente' } },
];

function build(
  configRow: { deliveryConfig: unknown } | null = { deliveryConfig: null },
  orders: unknown[] = [],
) {
  const orderFindMany = jest.fn().mockResolvedValue(orders);
  const findMany = jest.fn().mockResolvedValue(VARIANTS);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue(configRow);
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    productVariant: { findMany, updateMany },
    merchantConfig: { findUnique, update },
    order: { findMany: orderFindMany },
  } as unknown as PrismaService;
  const config = new DeliveryConfigService(prisma);
  return {
    service: new DeliveryCommandsService(prisma, config),
    findMany,
    updateMany,
    update,
    orderFindMany,
  };
}

describe('DeliveryCommandsService — agotado/disponible (RN-22, AC-20)', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.useRealTimers());

  it('devuelve null para texto que no es comando de delivery', async () => {
    const { service, findMany } = build();
    expect(await service.tryHandle('m1', 'PAGADO ORD-0042')).toBeNull();
    expect(await service.tryHandle('m1', '   ')).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('AC-20: "agotado coca 400" con 1 coincidencia pone isActive=false', async () => {
    const { service, findMany, updateMany } = build();
    const reply = await service.tryHandle('m1', 'Agotado Coca 400');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { product: { merchantId: 'm1' } } }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'v-coca-400', product: { merchantId: 'm1' } },
      data: { isActive: false },
    });
    expect(reply).toContain('Coca-Cola 400 ml');
    expect(reply).toContain('agotado');
  });

  it('AC-20: "disponible hamburguesa clasica" (sin tilde) revierte a isActive=true', async () => {
    const { service, updateMany } = build();
    const reply = await service.tryHandle('m1', 'disponible hamburguesa clasica');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v-burger', product: { merchantId: 'm1' } },
        data: { isActive: true },
      }),
    );
    expect(reply).toBe('✅ Hamburguesa Clásica vuelve a estar disponible.');
  });

  it('RN-22: varias coincidencias → lista numerada y "agotado 2" resuelve', async () => {
    const { service, updateMany } = build();
    const list = await service.tryHandle('m1', 'agotado coca');
    expect(list).toContain('1. Coca-Cola 400 ml');
    expect(list).toContain('2. Coca-Cola 1.5 L');
    expect(updateMany).not.toHaveBeenCalled();

    await service.tryHandle('m1', 'agotado 2');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v-coca-15', product: { merchantId: 'm1' } } }),
    );
  });

  it('RN-22: un número solo resuelve la lista pendiente con la acción original', async () => {
    const { service, updateMany } = build();
    await service.tryHandle('m1', 'disponible coca');
    await service.tryHandle('m1', '1');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: true } }));
    // Ya resuelta: un número suelto deja de ser comando.
    expect(await service.tryHandle('m1', '1')).toBeNull();
  });

  it('número fuera de rango pide un número válido', async () => {
    const { service, updateMany } = build();
    await service.tryHandle('m1', 'agotado coca');
    expect(await service.tryHandle('m1', '7')).toBe('Elige un número entre 1 y 2.');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('la lista pendiente expira a los 10 min y es por comercio', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-28T12:00:00Z'));
    const { service } = build();
    await service.tryHandle('m1', 'agotado coca');
    expect(await service.tryHandle('m2', '1')).toBeNull();
    jest.setSystemTime(Date.now() + STOCK_CHOICE_TTL_MS + 1);
    expect(await service.tryHandle('m1', '1')).toBeNull();
  });

  it('sin coincidencias → mensaje y sin escritura', async () => {
    const { service, updateMany } = build();
    const reply = await service.tryHandle('m1', 'agotado pizza');
    expect(reply).toContain('No encontré "pizza"');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('"agotado" sin texto explica el formato', async () => {
    const { service } = build();
    expect(await service.tryHandle('m1', 'agotado')).toContain('agotado <producto>');
  });
});

describe('DeliveryCommandsService — cerrar/abrir tienda y ayuda (AC-20)', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));

  it('AC-20: "cerrar tienda" pone temporarilyClosed=true conservando el resto del JSON', async () => {
    const { service, update } = build({
      deliveryConfig: { timezone: 'America/Bogota', prepMinutes: 25 },
    });
    const reply = await service.tryHandle('m1', 'Cerrar tienda');
    expect(update).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      data: {
        deliveryConfig: { timezone: 'America/Bogota', prepMinutes: 25, temporarilyClosed: true },
      },
    });
    expect(reply).toContain('Tienda cerrada');
  });

  it('AC-20: "abrir tienda" pone temporarilyClosed=false', async () => {
    const { service, update } = build({ deliveryConfig: { temporarilyClosed: true } });
    const reply = await service.tryHandle('m1', 'abrir tienda');
    expect(update).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      data: { deliveryConfig: { temporarilyClosed: false } },
    });
    expect(reply).toContain('Tienda abierta');
  });

  it('deliveryConfig null → guarda solo el campo (el resto sale de los defaults técnicos)', async () => {
    const { service, update } = build({ deliveryConfig: null });
    await service.tryHandle('m1', 'cerrar tienda');
    expect(update).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      data: { deliveryConfig: { temporarilyClosed: true } },
    });
  });

  it('idempotente: abrir una tienda ya abierta no escribe', async () => {
    const { service, update } = build({ deliveryConfig: null });
    expect(await service.tryHandle('m1', 'abrir tienda')).toBe('La tienda ya estaba abierta.');
    expect(update).not.toHaveBeenCalled();
  });

  it('sin MerchantConfig → mensaje y sin escritura', async () => {
    const { service, update } = build(null);
    expect(await service.tryHandle('m1', 'cerrar tienda')).toContain('aún no tiene configuración');
    expect(update).not.toHaveBeenCalled();
  });

  it('"ayuda" devuelve solo la sección de delivery con todos los comandos', async () => {
    const { service } = build();
    const reply = await service.tryHandle('m1', 'Ayuda');
    expect(reply).toBe(DELIVERY_HELP_TEXT);
    for (const cmd of [
      'preparando',
      'salio',
      'entregado',
      'cancelar',
      'agotado',
      'disponible',
      'cerrar tienda',
      'abrir tienda',
      'reporte mes',
    ]) {
      expect(reply).toContain(cmd);
    }
  });
});

describe('DeliveryCommandsService — reporte (F-13, AC-21)', () => {
  const H = 60 * 60 * 1000;
  const order = (total: number, createdAt: string, cancelAfterH?: number) => ({
    totalAmount: new Prisma.Decimal(total),
    status: cancelAfterH === undefined ? OrderStatus.delivered : OrderStatus.cancelled,
    createdAt: new Date(createdAt),
    cancelledAt:
      cancelAfterH === undefined
        ? null
        : new Date(new Date(createdAt).getTime() + cancelAfterH * H),
  });
  afterEach(() => jest.useRealTimers());

  it('AC-21: "reporte" a las 23:59 de Bogotá cuenta los facturables de hoy local con total en COP', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-29T04:59:00Z')); // 28/11 23:59 local
    const orders = [
      order(28000, '2026-11-28T15:00:00Z'),
      order(15500, '2026-11-29T04:30:00Z'),
      order(40000, '2026-11-28T16:00:00Z', 1), // cancelado en < 24 h → no facturable
    ];
    const { service, orderFindMany } = build(
      { deliveryConfig: { timezone: 'America/Bogota' } },
      orders,
    );
    const reply = await service.tryHandle('m1', 'reporte');
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          merchantId: 'm1',
          createdAt: {
            gte: new Date('2026-11-28T05:00:00Z'),
            lt: new Date('2026-11-29T05:00:00Z'),
          },
        },
      }),
    );
    expect(reply).toBe('📊 Reporte de hoy (28/11/2026)\nPedidos facturables: 2\nTotal: $43.500');
  });

  it('AC-21: "reporte" a las 00:00 de Bogotá usa el día nuevo', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-29T05:00:00Z'));
    const { service, orderFindMany } = build({ deliveryConfig: null });
    const reply = await service.tryHandle('m1', 'Reporte');
    const where = orderFindMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-11-29T05:00:00Z'));
    expect(reply).toContain('Pedidos facturables: 0');
    expect(reply).toContain('Total: $0');
  });

  it('AC-21: "reporte mes" cubre el mes local; cancelado después de 24 h sí es facturable', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-28T17:00:00Z'));
    const orders = [
      order(100000, '2026-11-02T15:00:00Z', 30),
      order(20000, '2026-11-10T15:00:00Z'),
    ];
    const { service, orderFindMany } = build({ deliveryConfig: null }, orders);
    const reply = await service.tryHandle('m1', 'reporte mes');
    expect(orderFindMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date('2026-11-01T05:00:00Z'),
      lt: new Date('2026-12-01T05:00:00Z'),
    });
    expect(reply).toBe('📊 Reporte del mes (11/2026)\nPedidos facturables: 2\nTotal: $120.000');
  });

  it('cancelado sin fecha de cancelación no se factura (conservador)', async () => {
    const orders = [{ ...order(9000, '2026-11-28T15:00:00Z'), status: OrderStatus.cancelled }];
    const { service } = build({ deliveryConfig: null }, orders);
    expect(await service.tryHandle('m1', 'reporte')).toContain('Pedidos facturables: 0');
  });
});
