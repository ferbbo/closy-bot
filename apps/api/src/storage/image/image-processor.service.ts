import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import sharp from 'sharp';

/** Maximum width in pixels for product images */
const MAX_WIDTH_PX = 1200;

/** WebP quality (0–100) — 80 gives good balance of quality/size */
const WEBP_QUALITY = 80;

/**
 * ImageProcessorService
 *
 * Converts raw image buffers to WebP format with:
 * - Resize to max 1200px width (maintaining aspect ratio, no upscaling)
 * - WebP quality 80
 *
 * Uses `sharp` (libvips-based) for high-performance native processing.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  /**
   * Process a raw product image into a standardised WebP buffer.
   *
   * @param buffer Raw image bytes (JPEG, PNG, or WebP)
   * @returns Processed WebP buffer
   */
  async processProductImage(buffer: Buffer): Promise<Buffer> {
    try {
      const result = await sharp(buffer)
        .resize({ width: MAX_WIDTH_PX, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      this.logger.debug(
        `Image processed: ${buffer.length} bytes → ${result.length} bytes (WebP)`,
      );

      return result;
    } catch (err) {
      this.logger.error(`Image processing failed: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to process image');
    }
  }
}
