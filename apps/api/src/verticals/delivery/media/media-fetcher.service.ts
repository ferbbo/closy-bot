import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FetchedMedia, MediaFetcher, MediaResult } from '../contracts';

const DOWNLOAD_TIMEOUT_MS = 10_000; // RN-24

/**
 * GraphMediaFetcher (S5.0-T2): descarga media de WhatsApp Cloud API en memoria.
 * GET /{media-id} → url temporal → GET url (ambas con el token del canal).
 * No persiste nada (RN-24): solo devuelve el buffer al llamador del turno.
 */
@Injectable()
export class GraphMediaFetcher implements MediaFetcher {
  private readonly logger = new Logger(GraphMediaFetcher.name);

  constructor(private readonly configService: ConfigService) {}

  async fetch(
    merchantId: string,
    _channelId: string | null,
    mediaId: string,
    limits: { maxBytes: number },
  ): Promise<MediaResult<FetchedMedia>> {
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    const apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    const apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v18.0');

    if (!accessToken) {
      this.logger.warn('WHATSAPP_ACCESS_TOKEN not set; media fetch skipped');
      return { ok: false, reason: 'PROVIDER_ERROR' };
    }

    try {
      const infoResponse = await this.withTimeout((signal) =>
        fetch(`${apiUrl}/${apiVersion}/${mediaId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        }),
      );
      if (!infoResponse.ok) {
        this.logger.warn(`Media info request failed with status ${infoResponse.status}`);
        return { ok: false, reason: 'DOWNLOAD_FAILED' };
      }
      const info = (await infoResponse.json()) as {
        url?: string;
        mime_type?: string;
        file_size?: number;
      };
      if (!info.url) {
        return { ok: false, reason: 'DOWNLOAD_FAILED' };
      }
      if (typeof info.file_size === 'number' && info.file_size > limits.maxBytes) {
        return { ok: false, reason: 'TOO_LARGE' };
      }

      const fileResponse = await this.withTimeout((signal) =>
        fetch(info.url as string, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        }),
      );
      if (!fileResponse.ok) {
        return { ok: false, reason: 'DOWNLOAD_FAILED' };
      }
      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      if (buffer.length === 0) {
        return { ok: false, reason: 'EMPTY' };
      }
      if (buffer.length > limits.maxBytes) {
        return { ok: false, reason: 'TOO_LARGE' };
      }

      return {
        ok: true,
        value: {
          buffer,
          mimeType: info.mime_type ?? 'application/octet-stream',
          sizeBytes: buffer.length,
        },
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { ok: false, reason: 'TIMEOUT' };
      }
      this.logger.error(
        `Media fetch failed for merchant=${merchantId}: ${(error as Error).message}`,
      );
      return { ok: false, reason: 'PROVIDER_ERROR' };
    }
  }

  private async withTimeout(fn: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}
