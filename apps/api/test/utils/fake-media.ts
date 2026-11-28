/**
 * Fakes de media (S5.0-T2, extendido por S5.2/S5.3) — nunca llaman a Graph API, Groq Whisper
 * ni Groq Vision. Importables desde specs unit en src y desde e2e.
 */
import type {
  FetchedMedia,
  ImageInterpretation,
  ImageInterpreter,
  MediaFetcher,
  MediaResult,
  Transcriber,
} from '../../src/verticals/delivery/contracts';

const DEFAULT_MEDIA: FetchedMedia = {
  buffer: Buffer.from('fake-media'),
  mimeType: 'application/octet-stream',
  sizeBytes: 10,
};

/**
 * FakeMediaFetcher — responde con un `FetchedMedia` fijo (o un fallo) sin descargar nada.
 *
 *   const fetcher = new FakeMediaFetcher({ ok: true, value: { buffer, mimeType: 'audio/ogg', sizeBytes: buffer.length } });
 *   const failing = new FakeMediaFetcher({ ok: false, reason: 'TOO_LARGE' });
 */
export class FakeMediaFetcher implements MediaFetcher {
  public readonly calls: Array<{ merchantId: string; channelId: string | null; mediaId: string }> =
    [];

  constructor(
    private readonly response: MediaResult<FetchedMedia> = { ok: true, value: DEFAULT_MEDIA },
  ) {}

  async fetch(
    merchantId: string,
    channelId: string | null,
    mediaId: string,
  ): Promise<MediaResult<FetchedMedia>> {
    this.calls.push({ merchantId, channelId, mediaId });
    return this.response;
  }
}

/**
 * FakeTranscriber(text|failure) — devuelve el texto fijo que se le pase, o el fallo indicado.
 * Igual que el transcriptor real, un audio con `durationSec > maxDurationSec` → TOO_LONG (RN-24).
 *
 *   new FakeTranscriber('2 hamburguesas sencillas sin cebolla y una coca 400')
 *   new FakeTranscriber({ ok: false, reason: 'TOO_LONG' })
 */
export class FakeTranscriber implements Transcriber {
  public readonly calls: Array<{
    media: FetchedMedia;
    opts: { language: 'es'; maxDurationSec: number };
  }> = [];
  private readonly response: MediaResult<{ text: string }>;

  constructor(textOrFailure: string | MediaResult<{ text: string }>) {
    this.response =
      typeof textOrFailure === 'string'
        ? { ok: true, value: { text: textOrFailure } }
        : textOrFailure;
  }

  async transcribe(
    media: FetchedMedia,
    opts: { language: 'es'; maxDurationSec: number },
  ): Promise<MediaResult<{ text: string }>> {
    this.calls.push({ media, opts });
    if (typeof media.durationSec === 'number' && media.durationSec > opts.maxDurationSec) {
      return { ok: false, reason: 'TOO_LONG' };
    }
    return this.response;
  }
}

/**
 * FakeImageInterpreter(interpretation|failure) — devuelve la interpretación fija, o el fallo indicado.
 *
 *   new FakeImageInterpreter({ kind: 'product', items: [{ query: 'hamburguesa tocineta', quantity: 2 }], confidence: 'HIGH' })
 *   new FakeImageInterpreter({ ok: false, reason: 'UNSUPPORTED' })
 */
export class FakeImageInterpreter implements ImageInterpreter {
  private response!: MediaResult<ImageInterpretation>;
  /** Opciones recibidas por llamada (S5.3: verificar que nunca llegan precios al intérprete). */
  public readonly calls: Array<{ caption?: string; merchantCategories: string[] }> = [];

  constructor(interpretationOrFailure: ImageInterpretation | MediaResult<ImageInterpretation>) {
    this.respondWith(interpretationOrFailure);
  }

  /** S5.3: cambia la respuesta entre casos de un mismo e2e (una sola instancia en el módulo). */
  respondWith(
    interpretationOrFailure: ImageInterpretation | MediaResult<ImageInterpretation>,
  ): this {
    this.response =
      'ok' in interpretationOrFailure
        ? (interpretationOrFailure as MediaResult<ImageInterpretation>)
        : { ok: true, value: interpretationOrFailure as ImageInterpretation };
    return this;
  }

  async interpret(
    _media?: unknown,
    opts?: { caption?: string; merchantCategories: string[] },
  ): Promise<MediaResult<ImageInterpretation>> {
    if (opts) this.calls.push(opts);
    return this.response;
  }
}
