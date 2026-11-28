import { MediaRouter } from './media-router.service';
import { DELIVERY_TEXTS } from '../agent/delivery-agent.prompt';
import type {
  VerticalContext,
  MediaFetcher,
  Transcriber,
  ImageInterpreter,
  ImageInterpretation,
} from '../contracts';
import { PHOTO_TEXTS, type ProductPhotoResolver } from './product-photo.service';

const ctx = (
  mediaType?: 'audio' | 'image',
  mediaId?: string,
  caption?: string,
): VerticalContext => ({
  merchant: { id: 'm1', name: 'Burger Barrio', industry: 'restaurante', playbookConfig: null },
  customer: { id: 'c1', phone: '+573000000101' },
  conversation: { id: 'conv1', metadata: null },
  input: { messageId: 'wamid.1', text: '', timestamp: new Date(), mediaType, mediaId, caption },
});

const imageFetcher = () => ({
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    value: { buffer: Buffer.from('x'), mimeType: 'image/jpeg', sizeBytes: 1 },
  }),
});
const interpretAs = (value: ImageInterpretation) => ({
  interpret: jest.fn().mockResolvedValue({ ok: true, value }),
});
const imageRouter = (interpreter: { interpret: jest.Mock }, photo?: { resolve: jest.Mock }) =>
  new MediaRouter(
    imageFetcher() as unknown as MediaFetcher,
    { transcribe: jest.fn() } as unknown as Transcriber,
    interpreter as unknown as ImageInterpreter,
    photo as unknown as ProductPhotoResolver,
  );

describe('MediaRouter (S5.0-T3)', () => {
  it('returns none when the message has no media', async () => {
    const router = new MediaRouter(
      { fetch: jest.fn() } as unknown as MediaFetcher,
      { transcribe: jest.fn() } as unknown as Transcriber,
      { interpret: jest.fn() } as unknown as ImageInterpreter,
    );
    await expect(router.route(ctx())).resolves.toEqual({ action: 'none' });
  });

  it('audio: fallback when the fetcher fails to download', async () => {
    const mediaFetcher = { fetch: jest.fn().mockResolvedValue({ ok: false, reason: 'TOO_LARGE' }) };
    const router = new MediaRouter(
      mediaFetcher as unknown as MediaFetcher,
      { transcribe: jest.fn() } as unknown as Transcriber,
      { interpret: jest.fn() } as unknown as ImageInterpreter,
    );
    await expect(router.route(ctx('audio', 'media-1'))).resolves.toEqual({
      action: 'reply',
      response: DELIVERY_TEXTS.mediaFallback,
    });
  });

  it('audio: fallback when the stub Transcriber returns UNSUPPORTED', async () => {
    const mediaFetcher = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        value: { buffer: Buffer.from('x'), mimeType: 'audio/ogg', sizeBytes: 1 },
      }),
    };
    const transcriber = {
      transcribe: jest.fn().mockResolvedValue({ ok: false, reason: 'UNSUPPORTED' }),
    };
    const router = new MediaRouter(
      mediaFetcher as unknown as MediaFetcher,
      transcriber as unknown as Transcriber,
      { interpret: jest.fn() } as unknown as ImageInterpreter,
    );
    await expect(router.route(ctx('audio', 'media-1'))).resolves.toEqual({
      action: 'reply',
      response: DELIVERY_TEXTS.mediaFallback,
    });
  });

  it('audio: continue with the transcribed text and a truncated echo prefix', async () => {
    const mediaFetcher = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        value: { buffer: Buffer.from('x'), mimeType: 'audio/ogg', sizeBytes: 1 },
      }),
    };
    const longText = 'a'.repeat(250);
    const transcriber = {
      transcribe: jest.fn().mockResolvedValue({ ok: true, value: { text: longText } }),
    };
    const router = new MediaRouter(
      mediaFetcher as unknown as MediaFetcher,
      transcriber as unknown as Transcriber,
      { interpret: jest.fn() } as unknown as ImageInterpreter,
    );
    const result = await router.route(ctx('audio', 'media-1'));
    expect(result.action).toBe('continue');
    if (result.action === 'continue') {
      expect(result.text).toBe(longText);
      expect(result.echoPrefix.length).toBeLessThanOrEqual(202); // 200 + '\n\n'
      expect(result.echoPrefix.startsWith('🎙️ Entendí: «')).toBe(true);
    }
  });

  it('image: fallback when the interpreter fails (UNSUPPORTED)', async () => {
    const interpreter = {
      interpret: jest.fn().mockResolvedValue({ ok: false, reason: 'UNSUPPORTED' }),
    };
    const router = imageRouter(interpreter);
    await expect(router.route(ctx('image', 'media-2', 'hola'))).resolves.toEqual({
      action: 'reply',
      response: DELIVERY_TEXTS.mediaFallback,
    });
    expect(interpreter.interpret).toHaveBeenCalled();
  });

  it('image product (S5.3-T2): continue with candidates, synthetic agent text and echo', async () => {
    const candidate = {
      variantId: 'v-toc',
      productId: 'p',
      label: 'Hamburguesa de tocineta',
      unitPrice: 19000,
      score: 1,
    };
    const photo = {
      resolve: jest.fn().mockResolvedValue({
        status: 'FOUND',
        candidates: [{ ...candidate, suggestedQuantity: 2 }],
        agentText: '[foto de producto] …',
        echo: '📷 En tu foto veo: hamburguesa tocineta ×2',
      }),
    };
    const router = imageRouter(
      interpretAs({
        kind: 'product',
        items: [{ query: 'hamburguesa tocineta', quantity: 2 }],
        confidence: 'HIGH',
      }),
      photo,
    );
    const result = await router.route(ctx('image', 'media-2', 'de estas'));
    expect(photo.resolve).toHaveBeenCalledWith(
      'm1',
      [{ query: 'hamburguesa tocineta', quantity: 2 }],
      'de estas',
    );
    expect(result).toEqual({
      action: 'continue',
      text: '[foto de producto] …',
      echoPrefix: '📷 En tu foto veo: hamburguesa tocineta ×2\n\n',
      candidates: [{ ...candidate, suggestedQuantity: 2 }],
    });
  });

  it('image product without catalog matches → "no encontré" reply', async () => {
    const photo = { resolve: jest.fn().mockResolvedValue({ status: 'NOT_FOUND' }) };
    const router = imageRouter(
      interpretAs({
        kind: 'product',
        items: [{ query: 'sushi', quantity: null }],
        confidence: 'MED',
      }),
      photo,
    );
    await expect(router.route(ctx('image', 'media-2'))).resolves.toEqual({
      action: 'reply',
      response: PHOTO_TEXTS.notFound,
    });
  });

  it.each(['other', 'menu'] as const)(
    'image kind=%s → asks to describe it with text',
    async (kind) => {
      const photo = { resolve: jest.fn() };
      const router = imageRouter(interpretAs({ kind, items: [], confidence: 'LOW' }), photo);
      await expect(router.route(ctx('image', 'media-2'))).resolves.toEqual({
        action: 'reply',
        response: PHOTO_TEXTS.describe,
      });
      expect(photo.resolve).not.toHaveBeenCalled();
    },
  );

  it('video/document/sticker: unsupported type falls back without calling the fetcher', async () => {
    const mediaFetcher = { fetch: jest.fn() };
    const router = new MediaRouter(
      mediaFetcher as unknown as MediaFetcher,
      { transcribe: jest.fn() } as unknown as Transcriber,
      { interpret: jest.fn() } as unknown as ImageInterpreter,
    );
    await expect(
      router.route({ ...ctx(), input: { ...ctx().input, mediaType: 'video', mediaId: 'media-3' } }),
    ).resolves.toEqual({ action: 'reply', response: DELIVERY_TEXTS.mediaFallback });
    expect(mediaFetcher.fetch).not.toHaveBeenCalled();
  });
});
