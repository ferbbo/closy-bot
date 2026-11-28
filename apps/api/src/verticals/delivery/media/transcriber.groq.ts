import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq, { APIConnectionTimeoutError, toFile } from 'groq-sdk';
import type { FetchedMedia, MediaResult, Transcriber } from '../contracts';

export const TRANSCRIBE_TIMEOUT_MS = 9_000; // SPEC §3.5 (8–10 s)
const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';

/** Extensión que Whisper usa para inferir el formato (lo decide el nombre del archivo). */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

type GroqAudioClient = Pick<Groq, 'audio'>;

/**
 * GroqWhisperTranscriber (S5.2-T1): voz → texto con Groq Whisper (`DELIVERY_STT_MODEL`).
 * Nunca lanza: cualquier fallo se mapea a `MediaResult` y el MediaRouter pide texto (RN-24).
 * El audio solo vive en memoria durante la llamada; ni el audio ni la transcripción se loguean.
 */
@Injectable()
export class GroqWhisperTranscriber implements Transcriber {
  private readonly logger = new Logger(GroqWhisperTranscriber.name);
  private readonly client: GroqAudioClient | null;
  private readonly model: string;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('GROQ_API_KEY', '');
    this.client = apiKey ? new Groq({ apiKey, maxRetries: 0 }) : null;
    this.model = configService.get<string>('DELIVERY_STT_MODEL', DEFAULT_STT_MODEL);
  }

  async transcribe(
    media: FetchedMedia,
    opts: { language: 'es'; maxDurationSec: number },
  ): Promise<MediaResult<{ text: string }>> {
    if (!this.client) {
      return { ok: false, reason: 'UNSUPPORTED' };
    }
    if (typeof media.durationSec === 'number' && media.durationSec > opts.maxDurationSec) {
      return { ok: false, reason: 'TOO_LONG' };
    }
    if (media.sizeBytes === 0 || media.buffer.length === 0) {
      return { ok: false, reason: 'EMPTY' };
    }

    try {
      const file = await toFile(media.buffer, `voice.${extensionFor(media.mimeType)}`, {
        type: media.mimeType.split(';')[0].trim(),
      });
      const result = await this.client.audio.transcriptions.create(
        { file, model: this.model, language: opts.language, response_format: 'json' },
        { timeout: TRANSCRIBE_TIMEOUT_MS, maxRetries: 0 },
      );
      const text = (result?.text ?? '').trim();
      if (!text) {
        return { ok: false, reason: 'EMPTY' };
      }
      return { ok: true, value: { text } };
    } catch (error) {
      if (isTimeout(error)) {
        this.logger.warn('Transcription timed out');
        return { ok: false, reason: 'TIMEOUT' };
      }
      const status = (error as { status?: number }).status;
      this.logger.warn(`Transcription failed (status=${status ?? 'n/a'})`);
      return { ok: false, reason: 'PROVIDER_ERROR' };
    }
  }
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_MIME[base] ?? 'ogg'; // las notas de voz de WhatsApp son ogg/opus
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof APIConnectionTimeoutError ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}
