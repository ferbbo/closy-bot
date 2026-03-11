import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * StorageService — wraps @aws-sdk/client-s3 pointing at Cloudflare R2.
 *
 * R2 is S3-compatible. The endpoint is:{accountId}.r2.cloudflarestorage.com
 *
 * Required env vars (all optional — service will throw 503 if missing at runtime):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.configService.get<string>('R2_BUCKET_NAME');
    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      this.logger.error(
        'R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
          'R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL.',
      );
    }

    this.bucket = bucket ?? '';
    this.publicUrl = (publicUrl ?? '').replace(/\/$/, '');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId ?? 'unconfigured'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId ?? '',
        secretAccessKey: secretAccessKey ?? '',
      },
    });
  }

  /**
   * Upload a buffer to R2.
   * @param key      Object key (path) inside the bucket
   * @param buffer   Raw bytes to upload
   * @param contentType  MIME type (e.g. 'image/webp')
   * @returns Public URL of the uploaded object
   */
  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    this.assertConfigured();

    this.logger.debug(`Uploading to R2: key=${key}, size=${buffer.length}`);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    });

    try {
      await this.client.send(command);
    } catch (err) {
      this.logger.error(`R2 upload failed for key=${key}: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to upload image to storage');
    }

    return `${this.publicUrl}/${key}`;
  }

  /**
   * Delete an object from R2.
   * @param key Object key — must match exactly what was used in upload()
   */
  async delete(key: string): Promise<void> {
    this.assertConfigured();

    this.logger.debug(`Deleting from R2: key=${key}`);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.client.send(command);
    } catch (err) {
      this.logger.error(`R2 delete failed for key=${key}: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to delete image from storage');
    }
  }

  private assertConfigured(): void {
    if (!this.bucket || !this.publicUrl) {
      throw new InternalServerErrorException(
        'R2 storage is not configured. Contact administrator.',
      );
    }
  }
}
