import { Injectable, BadRequestException } from '@nestjs/common';

/** Supported MIME types for product images */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Maximum allowed file size: 5 MB */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Magic-byte signatures for allowed image formats.
 * We match against the first few bytes of the buffer to verify the file is
 * actually what the client claims (prevents MIME-spoofing — OWASP A03).
 */
const MAGIC_BYTES = {
  jpeg: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b: Buffer) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  webp: (b: Buffer) =>
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
} as const;

/**
 * ImageValidatorService
 *
 * Validates inbound image buffers before processing/upload:
 * - MIME type whitelist (jpeg, png, webp)
 * - Magic bytes check (prevents extension spoofing)
 * - Size limit (≤5 MB)
 *
 * Throws BadRequestException for any violation.
 */
@Injectable()
export class ImageValidatorService {
  /**
   * Validate a raw image buffer.
   * @param buffer   Raw file bytes
   * @param mimeType MIME type reported by the multipart parser
   * @param size     Reported file size in bytes
   */
  validateImageFile(buffer: Buffer, mimeType: string, size: number): void {
    // 1. Size check — reject early before touching bytes
    if (size > MAX_SIZE_BYTES) {
      throw new BadRequestException(
        `Image size exceeds the 5 MB limit (received: ${(size / 1024 / 1024).toFixed(1)} MB)`,
      );
    }

    // 2. MIME type whitelist
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        `Unsupported image type: ${mimeType}. Allowed types: jpeg, png, webp`,
      );
    }

    // 3. Magic bytes check — verify file header matches claimed MIME type
    if (buffer.length < 12) {
      throw new BadRequestException('File too small to be a valid image');
    }

    if (mimeType === 'image/jpeg' && !MAGIC_BYTES.jpeg(buffer)) {
      throw new BadRequestException(
        'File content does not match the declared MIME type (expected JPEG)',
      );
    }

    if (mimeType === 'image/png' && !MAGIC_BYTES.png(buffer)) {
      throw new BadRequestException(
        'File content does not match the declared MIME type (expected PNG)',
      );
    }

    if (mimeType === 'image/webp' && !MAGIC_BYTES.webp(buffer)) {
      throw new BadRequestException(
        'File content does not match the declared MIME type (expected WebP)',
      );
    }
  }
}
