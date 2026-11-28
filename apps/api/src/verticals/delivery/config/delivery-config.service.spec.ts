import { Logger } from '@nestjs/common';
import { DeliveryConfig, DeliveryZone, OpeningWindow } from '../contracts';
import { DeliveryConfigService, normalizeText } from './delivery-config.service';
import { buildRestauranteDefaults } from './restaurante.defaults';
import { PrismaService } from '../../../persistence/prisma/prisma.service';

const zones: DeliveryZone[] = [
  { id: 'cabecera', name: 'Cabecera', aliases: ['cabecera del llano'], fee: 4000, minOrder: 15000, etaMinutes: 20 },
  { id: 'canaveral', name: 'Cañaveral', aliases: [], fee: 6000, minOrder: 20000, etaMinutes: 30 },
  { id: 'san-alonso', name: 'San Alonso', aliases: ['sanalonso'], fee: 3000, minOrder: 10000, etaMinutes: 15 },
]; // prettier-ignore

function cfgWith(partial: Partial<DeliveryConfig>): DeliveryConfig {
  return { ...buildRestauranteDefaults(), ...partial };
}

function makeService(row: unknown) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const prisma = { merchantConfig: { findUnique } } as unknown as PrismaService;
  return { service: new DeliveryConfigService(prisma), findUnique };
}

describe('DeliveryConfigService.get', () => {
  it('AC-02: sin MerchantConfig → solo defaults técnicos e incompleto', async () => {
    const { service } = makeService(null);
    const { config, completeness } = await service.getWithCompleteness('m1');
    expect(config).toEqual(buildRestauranteDefaults());
    expect(completeness.complete).toBe(false);
    expect(completeness.missing).toEqual([
      'zones',
      'openingHours',
      'prepTimeMinutes',
      'paymentMethods',
    ]);
  });

  it('defaults + override guardado', async () => {
    const { service, findUnique } = makeService({
      deliveryConfig: { zones, prepTimeMinutes: 25 },
      paymentMethods: [],
    });
    const cfg = await service.get('m1');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'm1' } }),
    );
    expect(cfg.zones).toEqual(zones);
    expect(cfg.prepTimeMinutes).toBe(25);
    expect(cfg.maxLines).toBe(15);
  });

  it('JSON guardado inválido → warn sin valores y defaults', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = makeService({
      deliveryConfig: { zones: [{ id: 'x', name: '+573001234567' }] },
      paymentMethods: [],
    });
    expect(await service.get('m1')).toEqual(buildRestauranteDefaults());
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('zones[0].fee');
    expect(msg).not.toContain('+573001234567');
    warn.mockRestore();
  });
});

describe('DeliveryConfigService.isOpen (America/Bogota, UTC-5)', () => {
  const { service } = makeService(null);
  const hours: OpeningWindow[] = [
    { day: 1, open: '11:00', close: '22:00' }, // lunes
    { day: 5, open: '18:00', close: '02:00' }, // viernes, cruza medianoche
  ];
  const cfg = cfgWith({ openingHours: hours });
  // 2026-11-30 es lunes; 2026-12-04 es viernes. Hora local = UTC - 5.
  it.each([
    ['lunes 12:00', '2026-11-30T17:00:00Z', { open: true }],
    ['lunes 11:00 (borde de apertura)', '2026-11-30T16:00:00Z', { open: true }],
    ['lunes 22:00 (cierre exclusivo)', '2026-12-01T03:00:00Z', { open: false, nextOpening: { day: 5, time: '18:00' } }],
    ['lunes 09:00', '2026-11-30T14:00:00Z', { open: false, nextOpening: { day: 1, time: '11:00' } }],
    ['viernes 23:30', '2026-12-05T04:30:00Z', { open: true }],
    ['sábado 01:30 (ventana del viernes)', '2026-12-05T06:30:00Z', { open: true }],
    ['sábado 02:00', '2026-12-05T07:00:00Z', { open: false, nextOpening: { day: 1, time: '11:00' } }],
    ['domingo 12:00', '2026-12-06T17:00:00Z', { open: false, nextOpening: { day: 1, time: '11:00' } }],
  ])('%s → %j', (_label, iso, expected) => {
    expect(service.isOpen(cfg, new Date(iso))).toEqual(expected);
  }); // prettier-ignore

  it('AC-10: temporarilyClosed → cerrado aunque esté en horario', () => {
    const closed = cfgWith({ openingHours: hours, temporarilyClosed: true });
    expect(service.isOpen(closed, new Date('2026-11-30T17:00:00Z'))).toEqual({ open: false });
  });

  it('sin horario configurado → cerrado sin próxima apertura (RN-00)', () => {
    expect(service.isOpen(cfgWith({}), new Date('2026-11-30T17:00:00Z'))).toEqual({ open: false });
  });

  it('respeta la zona horaria configurada', () => {
    const madrid = cfgWith({ openingHours: hours, timezone: 'Europe/Madrid' });
    // 2026-11-30T17:00Z = lunes 18:00 en Madrid (abierto); 21:30Z = 22:30 (cerrado)
    expect(service.isOpen(madrid, new Date('2026-11-30T17:00:00Z')).open).toBe(true);
    expect(service.isOpen(madrid, new Date('2026-11-30T21:30:00Z')).open).toBe(false);
  });
});

describe('DeliveryConfigService.resolveZone (RN-08)', () => {
  const { service } = makeService(null);
  const cfg = cfgWith({ zones });
  it.each([
    ['Cabecera', 'cabecera'],
    ['CABECERA', 'cabecera'],
    ['Calle 45 #30-12, barrio Cabecera, apto 301', 'cabecera'],
    ['cabecera del llano', 'cabecera'],
    ['Cañaveral', 'canaveral'],
    ['canaveral', 'canaveral'],
    ['CAÑAVERAL, Floridablanca', 'canaveral'],
    ['san alonso', 'san-alonso'],
    ['San-Alonso', 'san-alonso'],
    ['sanalonso', 'san-alonso'],
    ['Cabeceras', null],
    ['Alonso', null],
    ['Girón', null],
    ['', null],
    ['   ', null],
  ])('%j → %s', (text, expected) => {
    expect(service.resolveZone(cfg, text)?.id ?? null).toBe(expected);
  });

  it('sin zonas configuradas → null', () => {
    expect(service.resolveZone(cfgWith({}), 'Cabecera')).toBeNull();
  });

  it('normalizeText quita tildes, mayúsculas y signos', () => {
    expect(normalizeText('  Ñuñoa, Bogotá!  ')).toBe('nunoa bogota');
  });
});
