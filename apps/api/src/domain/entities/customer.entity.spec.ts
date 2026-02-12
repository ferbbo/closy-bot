import { Customer } from './customer.entity';

describe('Customer Entity', () => {
  describe('normalizePhone', () => {
    it('should remove spaces from phone number', () => {
      expect(Customer.normalizePhone('+57 300 123 4567')).toBe('+573001234567');
    });

    it('should remove hyphens from phone number', () => {
      expect(Customer.normalizePhone('+57-300-123-4567')).toBe('+573001234567');
    });

    it('should remove parentheses from phone number', () => {
      expect(Customer.normalizePhone('+57 (300) 123-4567')).toBe('+573001234567');
    });

    it('should handle phone number with mixed formatting', () => {
      expect(Customer.normalizePhone('+1 (234) 567-8900')).toBe('+12345678900');
    });

    it('should return unchanged if already normalized', () => {
      expect(Customer.normalizePhone('+573001234567')).toBe('+573001234567');
    });

    it('should handle phone number without country code', () => {
      expect(Customer.normalizePhone('300-123-4567')).toBe('3001234567');
    });

    it('should handle empty spaces at beginning and end', () => {
      expect(Customer.normalizePhone(' +57 300 123 4567 ')).toBe('+573001234567');
    });

    it('should preserve plus sign and digits only', () => {
      const input = '+1 (800) 555-1234';
      const output = Customer.normalizePhone(input);
      expect(output).toBe('+18005551234');
      expect(output).toMatch(/^\+?[0-9]+$/);
    });
  });
});
