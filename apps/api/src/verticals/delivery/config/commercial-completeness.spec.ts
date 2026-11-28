import { buildRestauranteDefaults } from './restaurante.defaults';
import { isCommerciallyComplete } from './commercial-completeness';

const zone = {
  id: 'cabecera',
  name: 'Cabecera',
  aliases: ['cabecera del llano'],
  fee: 4000,
  minOrder: 15000,
  etaMinutes: 20,
};

describe('restaurante.defaults (RN-00 corolario 2)', () => {
  it('AC-02/AC-41: solo parámetros técnicos — sin zonas, horario, preparación ni pickup', () => {
    const d = buildRestauranteDefaults();
    expect(d.zones).toEqual([]);
    expect(d.openingHours).toEqual([]);
    expect(d.prepTimeMinutes).toBe(0);
    expect(d.freeDeliveryAbove).toBeNull();
    expect(d.pickupEnabled).toBe(false);
    expect(d.privacyPolicyUrl).toBeNull();
    expect(d.menuImageUrl).toBeNull();
    expect(d.assistantName).toBeNull();
    expect(d.timezone).toBe('America/Bogota');
    expect(d.trackStock).toBe(false);
    expect(d.pos).toEqual({ provider: 'none', enabled: false, settings: {}, secretRef: null });
  });

  it('devuelve una copia nueva en cada llamada', () => {
    const a = buildRestauranteDefaults();
    a.zones.push(zone);
    expect(buildRestauranteDefaults().zones).toEqual([]);
  });
});

describe('isCommerciallyComplete (AC-02, AC-41)', () => {
  it('AC-02: comercio sin deliveryConfig ni MerchantConfig → incompleto con los 4 campos', () => {
    expect(isCommerciallyComplete(buildRestauranteDefaults(), null)).toEqual({
      complete: false,
      missing: ['zones', 'openingHours', 'prepTimeMinutes', 'paymentMethods'],
    });
  });

  it('AC-41: medios de pago vacíos cuentan como faltantes', () => {
    const cfg = {
      ...buildRestauranteDefaults(),
      zones: [zone],
      openingHours: [{ day: 1 as const, open: '11:00', close: '22:00' }],
      prepTimeMinutes: 25,
    };
    expect(isCommerciallyComplete(cfg, { paymentMethods: [] })).toEqual({
      complete: false,
      missing: ['paymentMethods'],
    });
  });

  it('completo cuando zonas, horario, preparación y medios de pago vienen de la BD', () => {
    const cfg = {
      ...buildRestauranteDefaults(),
      zones: [zone],
      openingHours: [{ day: 1 as const, open: '11:00', close: '22:00' }],
      prepTimeMinutes: 25,
    };
    const mc = { paymentMethods: [{ type: 'cod', label: 'Contraentrega' }] };
    expect(isCommerciallyComplete(cfg, mc)).toEqual({ complete: true, missing: [] });
  });
});
