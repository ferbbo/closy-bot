import { getPresetForIndustry } from './merchant-config-presets';

describe('merchant-config-presets — restaurante (Delivery S1.2, RN-00)', () => {
  it('restaurante preset carries no invented commercial data', () => {
    const preset = getPresetForIndustry('restaurante');
    expect(preset.paymentMethods).toEqual([]);
    expect(preset.shippingConfig).toEqual({});
    expect(preset.returnPolicy).toBeNull();
  });

  it('legacy industries keep their presets', () => {
    expect(getPresetForIndustry('ropa').paymentMethods.length).toBeGreaterThan(0);
    expect(getPresetForIndustry(null)).toBe(getPresetForIndustry('ropa'));
  });
});
