import { verifyMetaSignature, maskSecret } from './signature.util';
import * as crypto from 'crypto';

describe('signature.util', () => {
  const testSecret = 'test-app-secret-12345';
  const testPayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '123', changes: [] }],
  });

  describe('verifyMetaSignature', () => {
    it('should verify valid signature', () => {
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(testPayload);
      const hash = hmac.digest('hex');
      const signature = `sha256=${hash}`;

      const result = verifyMetaSignature(testPayload, signature, testSecret);

      expect(result).toBe(true);
    });

    it('should verify valid signature with Buffer payload', () => {
      const payloadBuffer = Buffer.from(testPayload, 'utf8');
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(payloadBuffer);
      const hash = hmac.digest('hex');
      const signature = `sha256=${hash}`;

      const result = verifyMetaSignature(payloadBuffer, signature, testSecret);

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const signature = 'sha256=invalid_hash_12345';

      const result = verifyMetaSignature(testPayload, signature, testSecret);

      expect(result).toBe(false);
    });

    it('should reject signature without sha256 prefix', () => {
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(testPayload);
      const hash = hmac.digest('hex');
      const signature = hash; // Missing "sha256=" prefix

      const result = verifyMetaSignature(testPayload, signature, testSecret);

      expect(result).toBe(false);
    });

    it('should reject signature with wrong secret', () => {
      const hmac = crypto.createHmac('sha256', 'wrong-secret');
      hmac.update(testPayload);
      const hash = hmac.digest('hex');
      const signature = `sha256=${hash}`;

      const result = verifyMetaSignature(testPayload, signature, testSecret);

      expect(result).toBe(false);
    });

    it('should reject empty signature', () => {
      const result = verifyMetaSignature(testPayload, '', testSecret);

      expect(result).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      // This test ensures the function doesn't throw on malformed hashes
      const signature = 'sha256=notahexvalue';

      const result = verifyMetaSignature(testPayload, signature, testSecret);

      expect(result).toBe(false);
    });
  });

  describe('maskSecret', () => {
    it('should mask long secret', () => {
      const secret = 'my-secret-key-12345';

      const masked = maskSecret(secret);

      expect(masked).toBe('my-s***************');
      expect(masked.length).toBe(secret.length);
    });

    it('should mask short secret', () => {
      const secret = 'abc';

      const masked = maskSecret(secret);

      expect(masked).toBe('***');
    });

    it('should handle empty secret', () => {
      const masked = maskSecret('');

      expect(masked).toBe('***');
    });

    it('should show first 4 chars of secret', () => {
      const secret = 'test1234567890';

      const masked = maskSecret(secret);

      expect(masked.startsWith('test')).toBe(true);
      expect(masked.includes('1234567890')).toBe(false);
    });
  });
});
