import { FakeLlmProvider } from '../../../test/utils/fake-llm.provider';
import type { LlmProvider } from '../interfaces/llm-provider.interface';
import type { LlmToolRequest } from '../../verticals/delivery/contracts';

/** S1.3-T2: el spec vive en src/ porque el jest unit usa rootDir=src. */
describe('FakeLlmProvider', () => {
  const req = (content = 'hola'): LlmToolRequest => ({
    systemPrompt: 'sys',
    messages: [{ role: 'user', content }],
    tools: [],
  });

  it('implements LlmProvider and consumes the script in order (CONTRACTS usage)', async () => {
    const llm: LlmProvider = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
      { text: 'Listo' },
    ]);

    const first = await llm.generateWithTools(req());
    expect(first).toEqual({
      ok: true,
      text: null,
      toolCalls: [
        {
          id: 'fake_call_1',
          name: 'buscar_producto',
          arguments: { query: 'hamburguesa sencilla' },
        },
      ],
    });
    expect(await llm.generateWithTools(req())).toEqual({ ok: true, text: 'Listo', toolCalls: [] });
  });

  it('keeps explicit tool call ids and returns scripted failures', async () => {
    const llm = new FakeLlmProvider([
      { toolCalls: [{ id: 'c-9', name: 'ver_menu', arguments: {} }] },
      { failure: 'TIMEOUT' },
    ]);
    const res = await llm.generateWithTools(req());
    expect(res.ok && res.toolCalls[0].id).toBe('c-9');
    expect(await llm.generateWithTools(req())).toEqual({ ok: false, reason: 'TIMEOUT' });
  });

  it('records a deep copy of every request', async () => {
    const llm = new FakeLlmProvider([{ text: 'a' }, { text: 'b' }]);
    const r = req('primero');
    await llm.generateWithTools(r);
    r.messages.push({ role: 'assistant', content: 'mutado' });
    await llm.generateWithTools(req('segundo'));

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0]).toMatchObject({ method: 'generateWithTools' });
    expect(llm.calls[0].request).toMatchObject({
      messages: [{ role: 'user', content: 'primero' }],
    });
    expect((llm.calls[0].request as LlmToolRequest).messages).toHaveLength(1);
    expect(llm.remaining).toBe(0);
  });

  it('returns INVALID_RESPONSE when the script is exhausted (default)', async () => {
    const llm = new FakeLlmProvider([]);
    expect(await llm.generateWithTools(req())).toEqual({ ok: false, reason: 'INVALID_RESPONSE' });
    expect(llm.exhaustedCalls).toBe(1);
  });

  it('throws a clear error when exhausted in strict mode', async () => {
    const llm = new FakeLlmProvider([{ text: 'único' }], { strict: true });
    await llm.generateWithTools(req());
    await expect(llm.generateWithTools(req())).rejects.toThrow(/script exhausted/);
  });

  it('supports generateJson with { json } and { text } steps', async () => {
    const llm = new FakeLlmProvider([
      { json: { kind: 'product' } },
      { text: '{"a":1}' },
      { text: 'no json' },
    ]);
    const p = { systemPrompt: 's', userPrompt: 'u' };
    expect(await llm.generateJson(p)).toEqual({ ok: true, value: { kind: 'product' } });
    expect(await llm.generateJson(p)).toEqual({ ok: true, value: { a: 1 } });
    expect(await llm.generateJson(p)).toEqual({ ok: false, reason: 'INVALID_RESPONSE' });
    expect(llm.calls.map((c) => c.method)).toEqual([
      'generateJson',
      'generateJson',
      'generateJson',
    ]);
  });

  it('enqueue appends steps; generateResponse uses { text } steps', async () => {
    const llm = new FakeLlmProvider().enqueue({ text: 'hola' });
    await expect(
      llm.generateResponse({ systemPrompt: 's', userMessage: 'u' }),
    ).resolves.toMatchObject({ content: 'hola' });
    await expect(llm.generateResponse({ systemPrompt: 's', userMessage: 'u' })).rejects.toThrow(
      /needs a \{ text \} step/,
    );
  });
});
