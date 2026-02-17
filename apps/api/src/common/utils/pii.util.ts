/**
 * PII (Personally Identifiable Information) utilities for safe logging
 * Core V1 MVP: Mask sensitive data in logs to comply with privacy best practices
 */

/**
 * Mask phone number for PII-safe logging
 *
 * Examples:
 * - "+573001234567" -> "***4567" (short format)
 * - "+573001234567" -> "+57300****567" (long format, preserves country/area)
 *
 * @param phone - Full phone number
 * @param format - "short" (default) shows only last 4 digits, "long" preserves some prefix
 * @returns Masked phone number
 */
export function maskPhone(phone: string, format: 'short' | 'long' = 'short'): string {
  if (!phone) return '***';

  if (format === 'long') {
    // Long format: keep first 6 chars + mask middle + keep last 3
    // Example: +573001234567 -> +57300****567
    if (phone.length <= 6) return '****';
    return phone.slice(0, 6) + '****' + phone.slice(-3);
  }

  // Short format: show only last 4 digits
  // Example: +573001234567 -> ***4567
  if (phone.length <= 4) return '***';
  return `***${phone.slice(-4)}`;
}
