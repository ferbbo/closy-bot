import { ConfigService } from '@nestjs/config';
import { GraphMediaFetcher } from './media-fetcher.service';

describe('GraphMediaFetcher (S5.0-T2)', () => {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'WHATSAPP_ACCESS_TOKEN') return 'test-token';
      if (key === 'WHATSAPP_API_URL') return 'https://graph.example';
      if (key === 'WHATSAPP_API_VERSION') return 'v18.0';
      return fallback;
    }),
  } as unknown as ConfigService;

  let fetcher: GraphMediaFetcher;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetcher = new GraphMediaFetcher(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('downloads the media and returns buffer + mimeType', async () => {
    // TextEncoder gives an exact-size ArrayBuffer (unlike Buffer.from, which can be pool-backed)
    const bytes = new TextEncoder().encode('hola');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://graph.example/file',
          mime_type: 'audio/ogg',
          file_size: bytes.length,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      }) as unknown as typeof fetch;

    const result = await fetcher.fetch('merchant-1', null, 'media-1', { maxBytes: 1_000 });

    expect(result).toEqual({
      ok: true,
      value: { buffer: Buffer.from(bytes), mimeType: 'audio/ogg', sizeBytes: bytes.length },
    });
  });

  it('returns TOO_LARGE when file_size exceeds the limit', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://graph.example/file', file_size: 999_999 }),
    }) as unknown as typeof fetch;

    const result = await fetcher.fetch('merchant-1', null, 'media-1', { maxBytes: 10 });

    expect(result).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('returns DOWNLOAD_FAILED when the media info request fails', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 }) as unknown as typeof fetch;

    const result = await fetcher.fetch('merchant-1', null, 'media-1', { maxBytes: 1_000 });

    expect(result).toEqual({ ok: false, reason: 'DOWNLOAD_FAILED' });
  });

  it('returns EMPTY when the downloaded buffer has zero bytes', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://graph.example/file' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as typeof fetch;

    const result = await fetcher.fetch('merchant-1', null, 'media-1', { maxBytes: 1_000 });

    expect(result).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('returns TIMEOUT when the request aborts', async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    }) as unknown as typeof fetch;

    const result = await fetcher.fetch('merchant-1', null, 'media-1', { maxBytes: 1_000 });

    expect(result).toEqual({ ok: false, reason: 'TIMEOUT' });
  });

  it('returns PROVIDER_ERROR when WHATSAPP_ACCESS_TOKEN is missing', async () => {
    const emptyConfig = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    const fetcherWithoutToken = new GraphMediaFetcher(emptyConfig);

    const result = await fetcherWithoutToken.fetch('merchant-1', null, 'media-1', {
      maxBytes: 1_000,
    });

    expect(result).toEqual({ ok: false, reason: 'PROVIDER_ERROR' });
  });
});
