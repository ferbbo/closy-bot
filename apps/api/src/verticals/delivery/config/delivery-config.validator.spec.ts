import { validateDeliveryConfig } from './delivery-config.validator';
import { buildRestauranteDefaults } from './restaurante.defaults';

const zone = {
  id: 'cabecera',
  name: 'Cabecera',
  aliases: ['cabecera del llano'],
  fee: 4000,
  minOrder: 15000,
  etaMinutes: 20,
};

function errorsOf(input: unknown) {
  const r = validateDeliveryConfig(input);
  return r.ok ? [] : r.errors;
}

describe('validateDeliveryConfig', () => {
  it('los defaults técnicos son válidos por sí mismos', () => {
    expect(validateDeliveryConfig({}).ok).toBe(true);
  });

  it('acepta un override válido y lo mezcla con los defaults', () => {
    const r = validateDeliveryConfig({
      zones: [zone],
      openingHours: [{ day: 5, open: '18:00', close: '02:00' }],
      prepTimeMinutes: 25,
      notifications: { mode: 'auto' },
      pos: { settings: { storeId: 'x' } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.zones).toEqual([zone]);
    expect(r.value.notifications).toEqual({
      mode: 'auto',
      templateLanguage: 'es',
      maxBusinessInitiatedPerOrder: 6,
    });
    expect(r.value.pos.provider).toBe('none');
    expect(r.value.pos.settings).toEqual({ storeId: 'x' });
    expect(r.value.maxLines).toBe(15);
  });

  it('rechaza un input que no es objeto', () => {
    expect(errorsOf(null)).toEqual([{ path: '', message: 'must be an object' }]);
    expect(errorsOf([])).toEqual([{ path: '', message: 'must be an object' }]);
  });

  it.each([
    [{ timezone: 'Mars/Olympus' }, 'timezone'],
    [{ zones: [{ ...zone, fee: -1 }] }, 'zones[0].fee'],
    [{ zones: [{ ...zone, fee: 4000.5 }] }, 'zones[0].fee'],
    [{ zones: [{ ...zone, minOrder: '15000' }] }, 'zones[0].minOrder'],
    [{ zones: [{ ...zone, id: 'Cabecera Norte' }] }, 'zones[0].id'],
    [{ zones: [zone, { ...zone }] }, 'zones[1].id'],
    [{ zones: [{ ...zone, aliases: ['ok', ''] }] }, 'zones[0].aliases[1]'],
    [{ zones: [{ ...zone, extra: 1 }] }, 'zones[0].extra'],
    [{ zones: 'cabecera' }, 'zones'],
    [{ openingHours: [{ day: 7, open: '11:00', close: '22:00' }] }, 'openingHours[0].day'],
    [{ openingHours: [{ day: 1, open: '25:00', close: '22:00' }] }, 'openingHours[0].open'],
    [{ openingHours: [{ day: 1, open: '11:00', close: '11:00' }] }, 'openingHours[0].close'],
    [{ prepTimeMinutes: -5 }, 'prepTimeMinutes'],
    [{ freeDeliveryAbove: 0 }, 'freeDeliveryAbove'],
    [{ pickupEnabled: 'yes' }, 'pickupEnabled'],
    [{ maxQtyPerLine: 0 }, 'maxQtyPerLine'],
    [{ notifications: { mode: 'sms' } }, 'notifications.mode'],
    [{ privacyPolicyUrl: 'javascript:alert(1)' }, 'privacyPolicyUrl'],
    [{ pos: { secretRef: 'sk_live_123' } }, 'pos.secretRef'],
    [{ pos: { settings: { storeId: 1 } } }, 'pos.settings'],
    [{ unknownField: true }, 'unknownField'],
  ])('AC-02: %j → error en el path exacto %s', (input, path) => {
    const errs = errorsOf(input);
    expect(errs.map((e) => e.path)).toContain(path);
    expect(errs.every((e) => e.message.length > 0)).toBe(true);
  });

  it('acepta null en freeDeliveryAbove, assistantName y URLs', () => {
    expect(
      validateDeliveryConfig({
        freeDeliveryAbove: null,
        assistantName: null,
        privacyPolicyUrl: 'https://example.com/privacidad',
        menuImageUrl: null,
      }).ok,
    ).toBe(true);
  });

  it('valida sobre una base distinta (config guardada)', () => {
    const base = { ...buildRestauranteDefaults(), zones: [zone], prepTimeMinutes: 25 };
    const r = validateDeliveryConfig({ temporarilyClosed: true }, base);
    expect(r.ok && r.value.zones).toEqual([zone]);
    expect(r.ok && r.value.temporarilyClosed).toBe(true);
  });
});
