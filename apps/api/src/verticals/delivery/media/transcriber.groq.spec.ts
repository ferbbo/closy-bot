import { ConfigService } from '@nestjs/config';
import type { FetchedMedia } from '../contracts';

const create = jest.fn();
const groqCtor = jest.fn();

jest.mock('groq-sdk', () => {
  class APIConnectionTimeoutError extends Error {}
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((opts: unknown) => {
      groqCtor(opts);
      return { audio: { transcriptions: { create } } };
    }),
    APIConnectionTimeoutError,
    toFile: jest.fn(async (_buf: Buffer, name: string, opts?: { type?: string }) => ({
      name,
      type: opts?.type,
    })),
  };
});

import { APIConnectionTimeoutError } from 'groq-sdk';
import { GroqWhisperTranscriber, TRANSCRIBE_TIMEOUT_MS } from './transcriber.groq';

const configWith = (values: Record<string, string>): ConfigService =>
  ({
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  }) as unknown as ConfigService;

const audio = (overrides: Partial<FetchedMedia> = {}): FetchedMedia => ({
  buffer: Buffer.from('fake-ogg'),
  mimeType: 'audio/ogg; codecs=opus',
  sizeBytes: 8,
  ...overrides,
});

const OPTS = { language: 'es' as const, maxDurationSec: 120 };

describe('GroqWhisperTranscriber (S5.2-T1)', () => {
  let transcriber: GroqWhisperTranscriber;

  beforeEach(() => {
    create.mockReset();
    groqCtor.mockReset();
    transcriber = new GroqWhisperTranscriber(
      configWith({ GROQ_API_KEY: 'test-key', DELIVERY_STT_MODEL: 'whisper-test' }),
    );
  });

  it('transcribes with the configured model, language es, a timeout and no retries', async () => {
    create.mockResolvedValue({ text: '  2 hamburguesas sencillas sin cebolla  ' });

    const result = await transcriber.transcribe(audio(), OPTS);

    expect(result).toEqual({ ok: true, value: { text: '2 hamburguesas sencillas sin cebolla' } });
    expect(groqCtor).toHaveBeenCalledWith({ apiKey: 'test-key', maxRetries: 0 });
    expect(create).toHaveBeenCalledWith(
      {
        file: { name: 'voice.ogg', type: 'audio/ogg' },
        model: 'whisper-test',
        language: 'es',
        response_format: 'json',
      },
      { timeout: TRANSCRIBE_TIMEOUT_MS, maxRetries: 0 },
    );
    expect(TRANSCRIBE_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
    expect(TRANSCRIBE_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });

  it('uses the file extension that matches the mime type', async () => {
    create.mockResolvedValue({ text: 'hola' });
    await transcriber.transcribe(audio({ mimeType: 'audio/mpeg' }), OPTS);
    expect(create.mock.calls[0][0].file.name).toBe('voice.mp3');
  });

  it('returns TOO_LONG without calling Groq when durationSec exceeds maxDurationSec', async () => {
    const result = await transcriber.transcribe(audio({ durationSec: 121 }), OPTS);
    expect(result).toEqual({ ok: false, reason: 'TOO_LONG' });
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts an audio exactly at the duration limit', async () => {
    create.mockResolvedValue({ text: 'ok' });
    const result = await transcriber.transcribe(audio({ durationSec: 120 }), OPTS);
    expect(result.ok).toBe(true);
  });

  it('returns EMPTY when Groq returns blank text', async () => {
    create.mockResolvedValue({ text: '   ' });
    await expect(transcriber.transcribe(audio(), OPTS)).resolves.toEqual({
      ok: false,
      reason: 'EMPTY',
    });
  });

  it('returns EMPTY for a zero-byte buffer without calling Groq', async () => {
    const result = await transcriber.transcribe(
      audio({ buffer: Buffer.alloc(0), sizeBytes: 0 }),
      OPTS,
    );
    expect(result).toEqual({ ok: false, reason: 'EMPTY' });
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a request timeout to TIMEOUT without throwing', async () => {
    create.mockRejectedValue(new APIConnectionTimeoutError());
    await expect(transcriber.transcribe(audio(), OPTS)).resolves.toEqual({
      ok: false,
      reason: 'TIMEOUT',
    });
  });

  it('maps an API error to PROVIDER_ERROR without throwing', async () => {
    create.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));
    await expect(transcriber.transcribe(audio(), OPTS)).resolves.toEqual({
      ok: false,
      reason: 'PROVIDER_ERROR',
    });
  });

  it('returns UNSUPPORTED when GROQ_API_KEY is not configured (no client created)', async () => {
    groqCtor.mockReset();
    const noKey = new GroqWhisperTranscriber(configWith({}));
    await expect(noKey.transcribe(audio(), OPTS)).resolves.toEqual({
      ok: false,
      reason: 'UNSUPPORTED',
    });
    expect(groqCtor).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
