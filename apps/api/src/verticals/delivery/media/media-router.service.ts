import { Inject, Injectable, Optional } from '@nestjs/common';
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
import { PHOTO_TEXTS, ProductPhotoResolver, type PhotoCandidate } from './product-photo.service';
import { ReceiptForwarder } from './receipt.service';

const AUDIO_MAX_BYTES = 16 * 1024 * 1024; // RN-24
const AUDIO_MAX_DURATION_SEC = 120; // RN-24
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // RN-24
const ECHO_MAX_CHARS = 200; // RN-24

export type MediaRouteResult =
  | { action: 'none' }
  | { action: 'continue'; text: string; echoPrefix: string; candidates?: PhotoCandidate[] }
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
    // S5.3: opcional para no romper construcciones de 3 args (spec compartido con S5.2);
    // en el módulo siempre se inyecta (MEDIA_PROVIDERS).
    @Optional() private readonly productPhoto?: ProductPhotoResolver,
    @Optional() private readonly receipts?: ReceiptForwarder,
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
      // S5.3-T3 (RN-26): comprobante por visión o por caption de pago, aunque la visión falle.
      const receipt = await this.receipts?.handle(
        ctx,
        interpretation.ok ? interpretation.value.kind : null,
      );
      if (receipt) {
        return { action: 'reply', response: receipt };
      }
      if (!interpretation.ok) {
        return { action: 'reply', response: DELIVERY_TEXTS.mediaFallback };
      }
      const { kind, items } = interpretation.value;
      // S5.3-T2 (RN-25): foto de producto → candidatos del catálogo; el agente pide la elección.
      if (kind === 'product' && items.length > 0 && this.productPhoto) {
        const photo = await this.productPhoto.resolve(ctx.merchant.id, items, ctx.input.caption);
        if (photo.status === 'NOT_FOUND') {
          return { action: 'reply', response: PHOTO_TEXTS.notFound };
        }
        return {
          action: 'continue',
          text: photo.agentText,
          echoPrefix: `${photo.echo}\n\n`,
          candidates: photo.candidates,
        };
      }
      // menu / other / producto sin consultas → que lo describa con texto
      return { action: 'reply', response: PHOTO_TEXTS.describe };
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
