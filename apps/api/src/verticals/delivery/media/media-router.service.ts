import { Inject, Injectable } from '@nestjs/common';
import {
  IMAGE_INTERPRETER,
  MEDIA_FETCHER,
  TRANSCRIBER,
  type ImageInterpreter,
  type MediaFetcher,
  type Transcriber,
  type VerticalContext,
} from '../contracts';
import { DELIVERY_TEXTS } from '../agent/delivery-agent.prompt';

const AUDIO_MAX_BYTES = 16 * 1024 * 1024; // RN-24
const AUDIO_MAX_DURATION_SEC = 120; // RN-24
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // RN-24
const ECHO_MAX_CHARS = 200; // RN-24

export type MediaRouteResult =
  | { action: 'none' }
  | { action: 'continue'; text: string; echoPrefix: string }
  | { action: 'reply'; response: string };

/**
 * MediaRouter (S5.0-T3): decide qué hacer con un mensaje de media antes de que
 * el handler siga con el turno normal. audio → Transcriber, image → ImageInterpreter.
 * Con los stubs de S5.0 (NULL_TRANSCRIBER/NULL_IMAGE_INTERPRETER) ambos caen al
 * fallback "escríbelo" hasta que S5.2 y S5.3 registren implementaciones reales.
 */
@Injectable()
export class MediaRouter {
  constructor(
    @Inject(MEDIA_FETCHER) private readonly mediaFetcher: MediaFetcher,
    @Inject(TRANSCRIBER) private readonly transcriber: Transcriber,
    @Inject(IMAGE_INTERPRETER) private readonly imageInterpreter: ImageInterpreter,
  ) {}

  async route(ctx: VerticalContext): Promise<MediaRouteResult> {
    const { mediaType, mediaId } = ctx.input;
    if (!mediaType || !mediaId) {
      return { action: 'none' };
    }

    if (mediaType === 'audio') {
      const media = await this.mediaFetcher.fetch(ctx.merchant.id, null, mediaId, {
        maxBytes: AUDIO_MAX_BYTES,
      });
      if (!media.ok) {
        return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
      }
      const transcription = await this.transcriber.transcribe(media.value, {
        language: 'es',
        maxDurationSec: AUDIO_MAX_DURATION_SEC,
      });
      if (!transcription.ok || !transcription.value.text.trim()) {
        return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
      }
      return {
        action: 'continue',
        text: transcription.value.text,
        echoPrefix: `${buildEcho(transcription.value.text)}\n\n`,
      };
    }

    if (mediaType === 'image') {
      const media = await this.mediaFetcher.fetch(ctx.merchant.id, null, mediaId, {
        maxBytes: IMAGE_MAX_BYTES,
      });
      if (!media.ok) {
        return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
      }
      const interpretation = await this.imageInterpreter.interpret(media.value, {
        caption: ctx.input.caption,
        merchantCategories: [],
      });
      if (!interpretation.ok) {
        return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
      }
      // S5.0 base: la vision no tiene consumidor todavía (S5.3 lo agrega: producto/comprobante).
      return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
    }

    // video/document/sticker: sin soporte en v1.
    return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
  }
}

function buildEcho(text: string): string {
  const prefix = '🎙️ Entendí: «';
  const suffix = '»';
  const budget = ECHO_MAX_CHARS - prefix.length - suffix.length;
  const truncated = text.length > budget ? `${text.slice(0, budget - 1)}…` : text;
  return `${prefix}${truncated}${suffix}`;
}
