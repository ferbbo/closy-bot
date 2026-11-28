import { ConfigService } from '@nestjs/config';
import { GroqLlmProvider } from './groq-llm.provider';
import type { LlmToolRequest } from '../../verticals/delivery/contracts';

jest.mock('groq-sdk');

/** S1.3-T1: generateWithTools / generateJson con el cliente groq mockeado (nunca Groq real). */
describe('GroqLlmProvider (S1.3 tools + json)', () => {
  let provider: GroqLlmProvider;
  let create: jest.Mock;

  const baseReq: LlmToolRequest = {
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'quiero una hamburguesa' }],
    tools: [
      {
        name: 'buscar_producto',
        description: 'Busca en el catálogo',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ],
  };

  const completion = (message: Record<string, unknown>) => ({
    model: 'm',
    choices: [{ message, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });

  beforeEach(() => {
    create = jest.fn();
    const { default: Groq } = jest.requireMock('groq-sdk');
    Groq.mockImplementation(() => ({ chat: { completions: { create } } }));
    const config = {
      get: jest.fn((key: string, def?: unknown) =>
        key === 'GROQ_API_KEY' ? 'test-key' : key === 'DELIVERY_LLM_MODEL' ? 'delivery-model' : def,
      ),
    } as unknown as ConfigService;
    provider = new GroqLlmProvider(config);
  });

  describe('generateWithTools', () => {
    it('maps tool calls (OpenAI format) and sends tools with tool_choice auto', async () => {
      create.mockResolvedValue(
        completion({
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'buscar_producto', arguments: '{"query":"hamburguesa"}' },
            },
          ],
        }),
      );

      const res = await provider.generateWithTools({
        ...baseReq,
        messages: [
          { role: 'user', content: 'hola' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'c0', name: 'ver_menu', arguments: {} }],
          },
          { role: 'tool', content: '{"ok":true}', toolCallId: 'c0' },
        ],
      });

      expect(res).toEqual({
        ok: true,
        text: null,
        toolCalls: [{ id: 'call_1', name: 'buscar_producto', arguments: { query: 'hamburguesa' } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      });
      const body = create.mock.calls[0][0];
      expect(body.model).toBe('delivery-model');
      expect(body.tool_choice).toBe('auto');
      expect(body.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'buscar_producto',
          description: 'Busca en el catálogo',
          parameters: baseReq.tools[0].parameters,
        },
      });
      expect(body.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hola' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c0', type: 'function', function: { name: 'ver_menu', arguments: '{}' } },
          ],
        },
        { role: 'tool', content: '{"ok":true}', tool_call_id: 'c0' },
      ]);
      expect(create.mock.calls[0][1].signal).toBeDefined();
    });

    it('returns text-only responses with empty toolCalls', async () => {
      create.mockResolvedValue(completion({ content: 'Listo, ¿algo más?' }));
      const res = await provider.generateWithTools(baseReq);
      expect(res).toMatchObject({ ok: true, text: 'Listo, ¿algo más?', toolCalls: [] });
    });

    it('returns TIMEOUT when the provider exceeds timeoutMs (never throws)', async () => {
      create.mockImplementation(() => new Promise(() => undefined));
      const res = await provider.generateWithTools({ ...baseReq, timeoutMs: 20 });
      expect(res).toEqual({ ok: false, reason: 'TIMEOUT' });
    });

    it('maps abort errors from the SDK to TIMEOUT', async () => {
      create.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'APIUserAbortError' }));
      expect(await provider.generateWithTools(baseReq)).toEqual({ ok: false, reason: 'TIMEOUT' });
    });

    it('maps provider errors to PROVIDER_ERROR (never throws)', async () => {
      create.mockRejectedValue(Object.assign(new Error('rate limit'), { status: 429 }));
      expect(await provider.generateWithTools(baseReq)).toEqual({
        ok: false,
        reason: 'PROVIDER_ERROR',
      });
    });

    it('maps Groq tool_use_failed (400) to INVALID_RESPONSE', async () => {
      create.mockRejectedValue(
        Object.assign(new Error('400 {"error":{"code":"tool_use_failed"}}'), { status: 400 }),
      );
      expect(await provider.generateWithTools(baseReq)).toEqual({
        ok: false,
        reason: 'INVALID_RESPONSE',
      });
    });

    it.each([
      ['invalid JSON', '{"query":'],
      ['non-object JSON', '["a"]'],
    ])('returns INVALID_RESPONSE when tool call arguments are %s', async (_label, args) => {
      create.mockResolvedValue(
        completion({
          content: null,
          tool_calls: [
            { id: 'c', type: 'function', function: { name: 'buscar_producto', arguments: args } },
          ],
        }),
      );
      expect(await provider.generateWithTools(baseReq)).toEqual({
        ok: false,
        reason: 'INVALID_RESPONSE',
      });
    });

    it('returns INVALID_RESPONSE when there is no text and no tool calls', async () => {
      create.mockResolvedValue({ choices: [] });
      expect(await provider.generateWithTools(baseReq)).toEqual({
        ok: false,
        reason: 'INVALID_RESPONSE',
      });
    });
  });

  describe('generateJson', () => {
    it('requests json_object and returns the parsed value', async () => {
      create.mockResolvedValue(completion({ content: '{"kind":"product","items":[]}' }));
      const res = await provider.generateJson<{ kind: string }>({
        systemPrompt: 'Responde en JSON',
        userPrompt: 'x',
      });
      expect(res).toEqual({ ok: true, value: { kind: 'product', items: [] } });
      expect(create.mock.calls[0][0].response_format).toEqual({ type: 'json_object' });
    });

    it('returns INVALID_RESPONSE on malformed JSON', async () => {
      create.mockResolvedValue(completion({ content: 'no es json' }));
      expect(await provider.generateJson({ systemPrompt: 's', userPrompt: 'u' })).toEqual({
        ok: false,
        reason: 'INVALID_RESPONSE',
      });
    });

    it('returns TIMEOUT / PROVIDER_ERROR without throwing', async () => {
      create.mockImplementationOnce(() => new Promise(() => undefined));
      expect(
        await provider.generateJson({ systemPrompt: 's', userPrompt: 'u', timeoutMs: 20 }),
      ).toEqual({ ok: false, reason: 'TIMEOUT' });

      create.mockRejectedValueOnce(new Error('boom'));
      expect(await provider.generateJson({ systemPrompt: 's', userPrompt: 'u' })).toEqual({
        ok: false,
        reason: 'PROVIDER_ERROR',
      });
    });
  });
});
