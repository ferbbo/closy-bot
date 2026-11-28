import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { DeliveryCommandsService, STOCK_CHOICE_TTL_MS } from './delivery-commands.service';

const VARIANTS = [
  { id: 'v-coca-400', name: '400 ml', product: { name: 'Coca-Cola' } },
  { id: 'v-coca-15', name: '1.5 L', product: { name: 'Coca-Cola' } },
  { id: 'v-burger', name: 'Única', product: { name: 'Hamburguesa Clásica' } },
  { id: 'v-perro', name: 'Sencillo', product: { name: 'Perro Caliente' } },
];

function build() {
  const findMany = jest.fn().mockResolvedValue(VARIANTS);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    productVariant: { findMany, updateMany },
  } as unknown as PrismaService;
  return { service: new DeliveryCommandsService(prisma), findMany, updateMany };
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
