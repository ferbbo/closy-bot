import type { PrismaService } from '../../../persistence/prisma/prisma.service';
import { DeliveryConfigService } from '../config/delivery-config.service';
import { buildRestauranteDefaults } from '../config/restaurante.defaults';
import type { DeliveryConfig, DeliveryZone } from '../contracts';
import { DeliveryQuoteService } from './delivery-quote.service';

const zones: DeliveryZone[] = [
  { id: 'cabecera', name: 'Cabecera', aliases: ['cabecera del llano'], fee: 4000, minOrder: 15000, etaMinutes: 20 },
  { id: 'provenza', name: 'Provenza', aliases: [], fee: 5000, minOrder: 15000, etaMinutes: 25 },
  { id: 'canaveral', name: 'Cañaveral', aliases: [], fee: 6000, minOrder: 20000, etaMinutes: 30 },
]; // prettier-ignore

const cfg: DeliveryConfig = { ...buildRestauranteDefaults(), zones, prepTimeMinutes: 25 };

function build(stored: unknown = cfg) {
  const findUnique = jest.fn().mockResolvedValue({ deliveryConfig: stored, paymentMethods: [] });
  const prisma = { merchantConfig: { findUnique } } as unknown as PrismaService;
  const configService = new DeliveryConfigService(prisma);
  return { service: new DeliveryQuoteService(configService), configService, findUnique };
}

describe('DeliveryQuoteService (S3.1-T1, AC-11, AC-12)', () => {
  describe('extractNeighborhood', () => {
    const { service } = build();
    it.each([
      ['Cra 27 #45-12, Cabecera', 'Cabecera'],
      ['cra 27 # 45-12 cabecera del llano apto 301', 'Cabecera'],
      ['Calle 10 #5-20, CAÑAVERAL', 'Cañaveral'],
      ['Calle 10 #5-20 - San Francisco', 'San Francisco'],
      ['Calle 10 #5-20, San Francisco, apto 301', 'San Francisco'],
      ['Calle 10 #5-20', null],
      ['Calle 10 #5-20, apto 301', null],
      ['Calle 10 # 5-20, 301', null],
      ['', null],
      [undefined, null],
    ])('%j → %j', (address, expected) => {
      expect(service.extractNeighborhood(cfg, address)).toBe(expected);
    });

    it('palabras completas: "Provenzal" no es Provenza', () => {
      expect(service.extractNeighborhood(cfg, 'Calle Provenzal 4')).toBeNull();
    });
  });

  it('lee la config del comercio de la BD en cada llamada (RN-00)', async () => {
    const { service, findUnique } = build();
    const input = { merchantId: 'm-1', neighborhood: 'Cabecera', subtotal: 28000 };
    await service.quote({ ...input, fulfillment: 'delivery' });
    await service.quote({ ...input, fulfillment: 'delivery' });
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(findUnique.mock.calls[0][0]).toMatchObject({ where: { merchantId: 'm-1' } });
  });

  it('AC-11: barrio extraído de la dirección → zona, tarifa y ETA de la BD', async () => {
    const { service } = build();
    await expect(
      service.quote({
        merchantId: 'm-1',
        address: 'Cra 27 #45-12, Provenza',
        subtotal: 28000,
        fulfillment: 'delivery',
      }),
    ).resolves.toEqual({
      ok: true,
      zoneId: 'provenza',
      zoneName: 'Provenza',
      fee: 5000,
      etaMinutes: 50,
      fulfillment: 'delivery',
    });
  });

  it('el barrio explícito tiene prioridad sobre la dirección', async () => {
    const { service } = build();
    const q = await service.quote({
      merchantId: 'm-1',
      address: 'Cra 27 #45-12, Cabecera',
      neighborhood: 'Provenza',
      subtotal: 28000,
      fulfillment: 'delivery',
    });
    expect(q).toMatchObject({ ok: true, zoneId: 'provenza' });
  });

  it('AC-11: barrio fuera de cobertura (segmento tras coma) → OUT_OF_COVERAGE', async () => {
    const { service } = build();
    const q = await service.quote({
      merchantId: 'm-1',
      address: 'Calle 10 #5-20, San Francisco',
      subtotal: 28000,
      fulfillment: 'delivery',
    });
    expect(q).toEqual({ ok: false, reason: 'OUT_OF_COVERAGE' });
  });

  it('dirección sin barrio detectable → NEEDS_NEIGHBORHOOD', async () => {
    const { service } = build();
    const q = await service.quote({
      merchantId: 'm-1',
      address: 'Calle 10 #5-20',
      subtotal: 28000,
      fulfillment: 'delivery',
    });
    expect(q).toEqual({ ok: false, reason: 'NEEDS_NEIGHBORHOOD' });
  });

  it('AC-12: subtotal bajo el mínimo de la zona → BELOW_MINIMUM con faltante', async () => {
    const { service } = build();
    const q = await service.quote({
      merchantId: 'm-1',
      neighborhood: 'Cañaveral',
      subtotal: 14000,
      fulfillment: 'delivery',
    });
    expect(q).toEqual({ ok: false, reason: 'BELOW_MINIMUM', minOrder: 20000, missing: 6000 });
  });

  it('pickup → tarifa 0 y ETA de preparación; quoteWithConfig devuelve la config', async () => {
    const { service } = build();
    const { quote, config } = await service.quoteWithConfig({
      merchantId: 'm-1',
      subtotal: 10000,
      fulfillment: 'pickup',
    });
    expect(quote).toEqual({
      ok: true,
      zoneId: null,
      zoneName: null,
      fee: 0,
      etaMinutes: 25,
      fulfillment: 'pickup',
    });
    expect(config.zones).toHaveLength(3);
  });
});
