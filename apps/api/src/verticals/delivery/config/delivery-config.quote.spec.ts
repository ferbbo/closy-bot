import { DeliveryConfig, DeliveryZone } from '../contracts';
import { DeliveryConfigService } from './delivery-config.service';
import { buildRestauranteDefaults } from './restaurante.defaults';
import { PrismaService } from '../../../persistence/prisma/prisma.service';

const zones: DeliveryZone[] = [
  { id: 'cabecera', name: 'Cabecera', aliases: ['cabecera del llano'], fee: 4000, minOrder: 15000, etaMinutes: 20 },
  { id: 'canaveral', name: 'Cañaveral', aliases: [], fee: 6000, minOrder: 20000, etaMinutes: 30 },
]; // prettier-ignore

const service = new DeliveryConfigService({} as PrismaService);

function cfgWith(partial: Partial<DeliveryConfig> = {}): DeliveryConfig {
  return { ...buildRestauranteDefaults(), zones, prepTimeMinutes: 25, ...partial };
}

describe('DeliveryConfigService.quote (RN-08 a RN-11, AC-11)', () => {
  it('AC-11: barrio en zona → tarifa, ETA = prep + trayecto', () => {
    expect(
      service.quote(cfgWith(), {
        neighborhood: 'Cabecera',
        subtotal: 28000,
        fulfillment: 'delivery',
      }),
    ).toEqual({
      ok: true,
      zoneId: 'cabecera',
      zoneName: 'Cabecera',
      fee: 4000,
      etaMinutes: 45,
      fulfillment: 'delivery',
    });
  });

  it('AC-11: alias con tildes y mayúsculas resuelve la zona', () => {
    const q = service.quote(cfgWith(), {
      neighborhood: 'CAÑAVERAL',
      subtotal: 20000,
      fulfillment: 'delivery',
    });
    expect(q).toMatchObject({ ok: true, zoneId: 'canaveral', fee: 6000, etaMinutes: 55 });
  });

  it('AC-11: sin barrio ni dirección → NEEDS_NEIGHBORHOOD', () => {
    expect(service.quote(cfgWith(), { subtotal: 28000, fulfillment: 'delivery' })).toEqual({
      ok: false,
      reason: 'NEEDS_NEIGHBORHOOD',
    });
    expect(
      service.quote(cfgWith(), { neighborhood: '   ', subtotal: 28000, fulfillment: 'delivery' }),
    ).toEqual({ ok: false, reason: 'NEEDS_NEIGHBORHOOD' });
  });

  it('solo dirección sin zona detectable → NEEDS_NEIGHBORHOOD', () => {
    const q = service.quote(cfgWith(), {
      address: 'Calle 45 #30-12',
      subtotal: 28000,
      fulfillment: 'delivery',
    });
    expect(q).toEqual({ ok: false, reason: 'NEEDS_NEIGHBORHOOD' });
  });

  it('solo dirección que contiene la zona → cotiza', () => {
    const q = service.quote(cfgWith(), {
      address: 'Calle 45 #30-12 Cabecera del Llano',
      subtotal: 28000,
      fulfillment: 'delivery',
    });
    expect(q).toMatchObject({ ok: true, zoneId: 'cabecera' });
  });

  it('AC-11: barrio fuera de cobertura → OUT_OF_COVERAGE', () => {
    expect(
      service.quote(cfgWith(), {
        neighborhood: 'Floridablanca – Lagos',
        subtotal: 28000,
        fulfillment: 'delivery',
      }),
    ).toEqual({ ok: false, reason: 'OUT_OF_COVERAGE' });
  });

  it('sin zonas configuradas (RN-00) → OUT_OF_COVERAGE, nunca una tarifa inventada', () => {
    const q = service.quote(cfgWith({ zones: [] }), {
      neighborhood: 'Cabecera',
      subtotal: 28000,
      fulfillment: 'delivery',
    });
    expect(q).toEqual({ ok: false, reason: 'OUT_OF_COVERAGE' });
  });

  it('RN-09: subtotal bajo el mínimo → BELOW_MINIMUM con minOrder y missing', () => {
    expect(
      service.quote(cfgWith(), {
        neighborhood: 'Cabecera',
        subtotal: 12000,
        fulfillment: 'delivery',
      }),
    ).toEqual({ ok: false, reason: 'BELOW_MINIMUM', minOrder: 15000, missing: 3000 });
  });

  it('RN-09: subtotal igual al mínimo → cotiza', () => {
    const q = service.quote(cfgWith(), {
      neighborhood: 'Cabecera',
      subtotal: 15000,
      fulfillment: 'delivery',
    });
    expect(q).toMatchObject({ ok: true, fee: 4000 });
  });

  it.each([
    [null, 100000, 4000],
    [50000, 49999, 4000],
    [50000, 50000, 0],
    [50000, 80000, 0],
  ])('RN-10: freeDeliveryAbove=%s, subtotal=%s → fee %s', (freeAbove, subtotal, fee) => {
    const q = service.quote(cfgWith({ freeDeliveryAbove: freeAbove }), {
      neighborhood: 'Cabecera',
      subtotal,
      fulfillment: 'delivery',
    });
    expect(q).toMatchObject({ ok: true, fee });
  });

  it('RN-10/RN-11: pickup → fee 0, ETA = prepTimeMinutes, sin zona ni mínimo', () => {
    expect(service.quote(cfgWith(), { subtotal: 1000, fulfillment: 'pickup' })).toEqual({
      ok: true,
      zoneId: null,
      zoneName: null,
      fee: 0,
      etaMinutes: 25,
      fulfillment: 'pickup',
    });
  });
});
