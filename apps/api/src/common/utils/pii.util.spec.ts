import { maskPhone } from './pii.util';

describe('PII Utilities', () => {
  describe('maskPhone', () => {
    describe('short format (default)', () => {
      it('should mask phone showing only last 4 digits', () => {
        expect(maskPhone('+573001234567')).toBe('***4567');
      });

      it('should handle short phones', () => {
        expect(maskPhone('+1234')).toBe('***1234');
        expect(maskPhone('123')).toBe('***');
        expect(maskPhone('')).toBe('***');
      });

      it('should handle various international formats', () => {
        expect(maskPhone('+12025551234')).toBe('***1234');
        expect(maskPhone('5551234567')).toBe('***4567');
      });
    });

    describe('long format', () => {
      it('should mask phone preserving prefix and last 3 digits', () => {
        expect(maskPhone('+573001234567', 'long')).toBe('+57300****567');
      });

      it('should handle short phones in long format', () => {
        expect(maskPhone('+12345', 'long')).toBe('****');
        expect(maskPhone('123', 'long')).toBe('****');
        expect(maskPhone('', 'long')).toBe('***');
      });

      it('should preserve country and area code', () => {
        expect(maskPhone('+12025551234', 'long')).toBe('+12025****234');
        expect(maskPhone('+5491112345678', 'long')).toBe('+54911****678');
      });
    });
  });
});
