import * as crypto from 'crypto';

/**
 * Utility for validating Meta WhatsApp webhook signatures
 * Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */

/**
 * Verify Meta webhook signature using HMAC SHA-256
 * Uses timing-safe comparison to prevent timing attacks
 *
 * @param payload - Raw request body (Buffer or string)
 * @param signature - X-Hub-Signature-256 header value (format: "sha256=<hash>")
 * @param secret - App Secret from Meta App Settings
 * @returns true if signature is valid
 */
export function verifyMetaSignature(
  payload: Buffer | string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expectedHash = signature.substring(7); // Remove "sha256=" prefix
  const hmac = crypto.createHmac('sha256', secret);
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  hmac.update(body);
  const computedHash = hmac.digest('hex');

  // Use timing-safe comparison
  try {
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');

    return (
      expectedBuffer.length === computedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, computedBuffer)
    );
  } catch {
    return false;
  }
}

/**
 * Mask sensitive data for logging
 */
export function maskSecret(secret: string): string {
  if (!secret || secret.length < 4) {
    return '***';
  }
  return `${secret.substring(0, 4)}${'*'.repeat(secret.length - 4)}`;
}
