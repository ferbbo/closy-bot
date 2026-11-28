import { ConfigService } from '@nestjs/config';
import { FakeLlmProvider } from '../../test/utils/fake-llm.provider';
import { runToolLoop, serializeToolResult } from './tool-loop';
import { LlmService } from './llm.service';
import type { GroqLlmProvider } from './providers/groq-llm.provider';
import type { PlaybookService } from '../services/playbook.service';
import type { MessageLogRepository } from '../persistence/repositories/message-log.repository';
import type { ConversationRepository } from '../persistence/repositories/conversation.repository';
import type { MemoryConfigService } from '../common/config/memory-config.service';
import type {
  DeliveryConfig,
  DeliveryTurnContext,
  LlmToolRequest,
  ToolHandler,
} from '../verticals/delivery/contracts';

/** S1.3-T3: runToolLoop con FakeLlmProvider (base de AC-03/04/07). */
describe('runToolLoop', () => {
  const ctx: DeliveryTurnContext = {
    merchantId: 'm1',
    customerId: 'c1',
    conversationId: 'conv-1',
    customerPhone: '+573000000101',
    text: 'quiero 2 hamburguesas sencillas',
    config: {} as DeliveryConfig,
    now: new Date('2026-11-28T18:00:00Z'),
    seenVariantIds: new Set<string>(),
  };
  const request: LlmToolRequest = {
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: ctx.text }],
    tools: [{ name: 'buscar_producto', description: 'd', parameters: { type: 'object' } }],
  };
  let logger: { log: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
  });

  it('executes tool calls, feeds results back and returns the final text', async () => {
    const llm = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
      { text: 'Listo' },
    ]);
    const buscar: ToolHandler = jest.fn(async (args, c) => {
      c.seenVariantIds.add('v1');
      return { ok: true, data: [{ variantId: 'v1', label: `x-${String(args.query)}` }] };
    });

    const res = await runToolLoop(
      llm,
      { request, handlers: { buscar_producto: buscar }, ctx },
      logger,
    );

    expect(res).toEqual({ finalText: 'Listo', toolTrace: [{ name: 'buscar_producto', ok: true }] });
    expect(buscar).toHaveBeenCalledWith({ query: 'hamburguesa sencilla' }, ctx);
    expect(llm.calls).toHaveLength(2);
    expect((llm.calls[1].request as LlmToolRequest).messages).toEqual([
      { role: 'user', content: ctx.text },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'fake_call_1',
            name: 'buscar_producto',
            arguments: { query: 'hamburguesa sencilla' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'fake_call_1',
        content: '{"ok":true,"data":[{"variantId":"v1","label":"x-hamburguesa sencilla"}]}',
      },
    ]);
    expect(request.messages).toHaveLength(1); // la request base no se muta
  });

  it('returns UNKNOWN_TOOL to the model and keeps going', async () => {
    const llm = new FakeLlmProvider([
      { toolCalls: [{ id: 'a', name: 'inventada', arguments: {} }] },
      { text: 'ok' },
    ]);
    const res = await runToolLoop(llm, { request, handlers: {}, ctx });
    expect(res).toEqual({ finalText: 'ok', toolTrace: [{ name: 'inventada', ok: false }] });
    expect((llm.calls[1].request as LlmToolRequest).messages[2]).toEqual({
      role: 'tool',
      toolCallId: 'a',
      content: '{"ok":false,"error":"UNKNOWN_TOOL"}',
    });
  });

  it('turns a throwing handler into ok:false TOOL_ERROR without breaking', async () => {
    const llm = new FakeLlmProvider([
      {
        toolCalls: [
          { id: 'a', name: 'boom', arguments: {} },
          { id: 'b', name: 'ver_carrito', arguments: {} },
        ],
      },
      { text: 'listo' },
    ]);
    const handlers: Record<string, ToolHandler> = {
      boom: async () => {
        throw new Error('db down');
      },
      ver_carrito: async () => ({ ok: true, data: { lines: [] } }),
    };
    const res = await runToolLoop(llm, { request, handlers, ctx });
    expect(res.toolTrace).toEqual([
      { name: 'boom', ok: false },
      { name: 'ver_carrito', ok: true },
    ]);
    expect((llm.calls[1].request as LlmToolRequest).messages[2].content).toBe(
      '{"ok":false,"error":"TOOL_ERROR"}',
    );
    expect(res.finalText).toBe('listo');
  });

  it.each(['TIMEOUT', 'PROVIDER_ERROR', 'INVALID_RESPONSE'] as const)(
    'cuts the loop with fallbackReason=%s on provider failure',
    async (reason) => {
      const llm = new FakeLlmProvider([
        { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'x' } }] },
        { failure: reason },
      ]);
      const res = await runToolLoop(
        llm,
        { request, handlers: { buscar_producto: async () => ({ ok: true }) }, ctx },
        logger,
      );
      expect(res).toEqual({
        finalText: null,
        toolTrace: [{ name: 'buscar_producto', ok: true }],
        fallbackReason: reason,
      });
      expect(logger.warn).toHaveBeenCalledTimes(1);
    },
  );

  it('stops with MAX_ITERATIONS (default 4)', async () => {
    const step = { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'x' } }] };
    const llm = new FakeLlmProvider([step, step, step, step, { text: 'nunca' }]);
    const res = await runToolLoop(llm, {
      request,
      handlers: { buscar_producto: async () => ({ ok: true }) },
      ctx,
    });
    expect(res.fallbackReason).toBe('MAX_ITERATIONS');
    expect(res.finalText).toBeNull();
    expect(res.toolTrace).toHaveLength(4);
    expect(llm.calls).toHaveLength(4);
  });

  it('honours a custom maxIterations', async () => {
    const llm = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: {} }] },
      { text: 'no llega' },
    ]);
    const res = await runToolLoop(llm, {
      request,
      handlers: { buscar_producto: async () => ({ ok: true }) },
      ctx,
      maxIterations: 1,
    });
    expect(res.fallbackReason).toBe('MAX_ITERATIONS');
    expect(llm.calls).toHaveLength(1);
  });

  it('logs a structured entry without customer text or phone (PII)', async () => {
    const llm = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesas sencillas' } }] },
      { text: 'Listo' },
    ]);
    await runToolLoop(
      llm,
      { request, handlers: { buscar_producto: async () => ({ ok: true }) }, ctx },
      logger,
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logger.log.mock.calls[0][0]);
    expect(entry).toMatchObject({
      event: 'llm.tool_loop',
      conversationId: 'conv-1',
      iterations: 2,
      toolCalls: [{ name: 'buscar_producto', ok: true }],
      fallbackReason: null,
    });
    expect(typeof entry.llmLatencyMs).toBe('number');
    const raw = logger.log.mock.calls[0][0] as string;
    expect(raw).not.toContain('hamburguesa');
    expect(raw).not.toContain(ctx.customerPhone);
  });

  it('serializes unserializable tool results to an explicit error', () => {
    expect(serializeToolResult({ ok: true, data: { n: BigInt(1) } })).toBe(
      '{"ok":false,"error":"UNSERIALIZABLE_RESULT"}',
    );
  });

  it('LlmService.runToolLoop delegates to the injected provider', async () => {
    const config = { get: jest.fn((_k: string, d?: unknown) => d) } as unknown as ConfigService;
    const service = new LlmService(
      config,
      {} as GroqLlmProvider,
      {} as PlaybookService,
      {} as MessageLogRepository,
      {} as ConversationRepository,
      {} as MemoryConfigService,
    );
    const llm = new FakeLlmProvider([{ text: 'hola' }]);
    await expect(
      service.runToolLoop({ request, handlers: {}, ctx, provider: llm }),
    ).resolves.toEqual({ finalText: 'hola', toolTrace: [] });
  });
});
