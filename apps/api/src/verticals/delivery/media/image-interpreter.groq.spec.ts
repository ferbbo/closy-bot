import { ConfigService } from '@nestjs/config';
import type { FetchedMedia } from '../contracts';
import {
  buildVisionPrompt,
  GroqVisionInterpreter,
  parseInterpretation,
  VISION_TIMEOUT_MS,
} from './image-interpreter.groq';

jest.mock('groq-sdk');

const jpeg: FetchedMedia = {
  buffer: Buffer.from('jpeg-bytes'),
  mimeType: 'image/jpeg',
  sizeBytes: 10,
};

/** S5.3-T1: GroqVisionInterpreter con el cliente groq mockeado (nunca Groq real). */
describe('GroqVisionInterpreter (S5.3-T1)', () => {
  let create: jest.Mock;

  const make = (apiKey = 'test-key') => {
    const config = {
      get: jest.fn((key: string, def?: unknown) =>
        key === 'GROQ_API_KEY' ? apiKey : key === 'DELIVERY_VISION_MODEL' ? 'vision-model' : def,
      ),
    } as unknown as ConfigService;
    return new GroqVisionInterpreter(config);
  };
  const reply = (content: string) => ({ choices: [{ message: { content } }] });

  beforeEach(() => {
    create = jest.fn();
    const { default: Groq } = jest.requireMock('groq-sdk');
    Groq.mockImplementation(() => ({ chat: { completions: { create } } }));
  });

  afterEach(() => jest.useRealTimers());

  it('sends the image as a base64 data URL with the vision model and parses the JSON', async () => {
    create.mockResolvedValue(
      reply(
        JSON.stringify({
          kind: 'product',
          items: [{ query: 'hamburguesa tocineta', quantity: 2 }],
          confidence: 'HIGH',
        }),
      ),
    );
    const res = await make().interpret(jpeg, { caption: 'quiero estas', merchantCategories: [] });

    expect(res).toEqual({
      ok: true,
      value: {
        kind: 'product',
        items: [{ query: 'hamburguesa tocineta', quantity: 2 }],
        confidence: 'HIGH',
      },
    });
    const [params] = create.mock.calls[0];
    expect(params.model).toBe('vision-model');
    expect(params.response_format).toEqual({ type: 'json_object' });
    const parts = params.messages[1].content;
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}` },
    });
    expect(parts[0].text).toContain('quiero estas');
  });

  it('the prompt is description-only: no prices or commercial data', () => {
    const prompt = buildVisionPrompt(['Hamburguesas', 'Bebidas']);
    expect(prompt).not.toMatch(/\$\s*\d/);
    expect(prompt).toContain('NUNCA escribas precios');
    expect(prompt).toContain('Hamburguesas, Bebidas');
  });

  it('without GROQ_API_KEY → UNSUPPORTED and no call', async () => {
    await expect(make('').interpret(jpeg, { merchantCategories: [] })).resolves.toEqual({
      ok: false,
      reason: 'UNSUPPORTED',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('unsupported mime type → UNSUPPORTED', async () => {
    const res = await make().interpret(
      { ...jpeg, mimeType: 'application/pdf' },
      { merchantCategories: [] },
    );
    expect(res).toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });

  it('provider error → PROVIDER_ERROR without throwing', async () => {
    create.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(make().interpret(jpeg, { merchantCategories: [] })).resolves.toEqual({
      ok: false,
      reason: 'PROVIDER_ERROR',
    });
  });

  it('SDK timeout error → TIMEOUT', async () => {
    create.mockRejectedValue(Object.assign(new Error('t'), { name: 'APIConnectionTimeoutError' }));
    await expect(make().interpret(jpeg, { merchantCategories: [] })).resolves.toEqual({
      ok: false,
      reason: 'TIMEOUT',
    });
  });

  it('hanging call → TIMEOUT after the vision timeout', async () => {
    jest.useFakeTimers();
    create.mockReturnValue(new Promise(() => undefined));
    const pending = make().interpret(jpeg, { merchantCategories: [] });
    await jest.advanceTimersByTimeAsync(VISION_TIMEOUT_MS + 1);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'TIMEOUT' });
  });

  it('non-JSON or invalid kind → PROVIDER_ERROR', async () => {
    create.mockResolvedValueOnce(reply('no es json'));
    await expect(make().interpret(jpeg, { merchantCategories: [] })).resolves.toEqual({
      ok: false,
      reason: 'PROVIDER_ERROR',
    });
    create.mockResolvedValueOnce(reply(JSON.stringify({ kind: 'pizza', items: [] })));
    await expect(make().interpret(jpeg, { merchantCategories: [] })).resolves.toEqual({
      ok: false,
      reason: 'PROVIDER_ERROR',
    });
  });
});

describe('parseInterpretation (strict validation)', () => {
  it('keeps max 5 items, drops price/id keys and non-positive or fractional quantities', () => {
    const out = parseInterpretation({
      kind: 'product',
      confidence: 'MED',
      items: [
        { query: 'perro especial', quantity: 1, price: 18000, variantId: 'v1' },
        { query: 'coca cola $4.000', quantity: 0 },
        { query: 'papas', quantity: 1.5 },
        { query: '   ', quantity: 1 },
        { query: 'salchipapa', quantity: '2' },
        { query: 'limonada', quantity: null },
        { query: 'malteada', quantity: 3 },
        { query: 'brownie', quantity: 1 },
      ],
    });
    expect(out).toEqual({
      kind: 'product',
      confidence: 'MED',
      items: [
        { query: 'perro especial', quantity: 1 },
        { query: 'coca cola', quantity: null },
        { query: 'papas', quantity: null },
        { query: 'salchipapa', quantity: null },
        { query: 'limonada', quantity: null },
      ],
    });
  });

  it('items only for kind=product; unknown confidence → LOW; non-object → null', () => {
    expect(
      parseInterpretation({ kind: 'payment_receipt', items: [{ query: 'x', quantity: 1 }] }),
    ).toEqual({ kind: 'payment_receipt', items: [], confidence: 'LOW' });
    expect(parseInterpretation(null)).toBeNull();
    expect(parseInterpretation([{ kind: 'product' }])).toBeNull();
  });
});
