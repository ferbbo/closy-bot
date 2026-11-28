import { FakeLlmProvider } from '../../../../test/utils/fake-llm.provider';
import { runToolLoop, type RunToolLoopParams } from '../../../llm/tool-loop';
import type { LlmService } from '../../../llm/llm.service';
import type { LlmProvider } from '../../../llm/interfaces/llm-provider.interface';
import type { DeliveryConfig, DeliveryTurnContext, ToolResult } from '../contracts';
import type { CatalogMatcherService } from '../catalog/catalog-matcher.service';
import type { BusinessInfoTool } from './tools/business-info.tool';
import type { CartTools } from './tools/cart.tools';
import type { CatalogTools } from './tools/catalog.tools';
import { DeliveryAgentService, freshCandidateIds } from './delivery-agent.service';
import { GroundingValidator } from './grounding-validator';
import { DELIVERY_TEXTS } from './delivery-agent.prompt';

const CART_TEXT =
  '2× Hamburguesa sencilla (sin cebolla) $28.000\n1× Coca-Cola 400 ml $4.000\nSubtotal $32.000';

function ctx(overrides: Partial<DeliveryTurnContext> = {}): DeliveryTurnContext {
  return {
    merchantId: 'm1',
    customerId: 'c1',
    conversationId: 'conv1',
    customerPhone: '+573000000101',
    text: '2 hamburguesas sencillas sin cebolla y una coca 400',
    config: { assistantName: null, toneHints: '' } as unknown as DeliveryConfig,
    now: new Date('2026-11-27T20:00:00-05:00'),
    seenVariantIds: new Set<string>(),
    ...overrides,
  };
}

function build(provider: FakeLlmProvider, matchStatus: 'MATCHED' | 'NOT_FOUND' = 'MATCHED') {
  const added: Array<Record<string, unknown>> = [];
  const catalogTools = {
    definitions: [{ name: 'buscar_producto', description: 'x', parameters: {} }],
    handlers: () => ({
      buscar_producto: async (
        args: Record<string, unknown>,
        c: DeliveryTurnContext,
      ): Promise<ToolResult> => {
        if (args.query === 'hamburguesa') {
          ['v-sen', 'v-dob', 'v-toc'].forEach((id) => c.seenVariantIds.add(id));
          return {
            ok: true,
            data: {
              status: 'AMBIGUOUS',
              candidates: [
                {
                  variantId: 'v-sen',
                  productId: 'p1',
                  label: 'Hamburguesa sencilla',
                  unitPrice: 16000,
                  score: 1,
                },
                {
                  variantId: 'v-dob',
                  productId: 'p2',
                  label: 'Hamburguesa doble',
                  unitPrice: 22000,
                  score: 1,
                },
                {
                  variantId: 'v-toc',
                  productId: 'p3',
                  label: 'Hamburguesa de tocineta',
                  unitPrice: 19000,
                  score: 1,
                },
              ],
            },
          };
        }
        c.seenVariantIds.add('v-sen');
        return {
          ok: true,
          data: { status: 'MATCHED', candidates: [{ variantId: 'v-sen', unitPrice: 14000 }] },
        };
      },
    }),
  } as unknown as CatalogTools;
  const businessInfo = { definitions: [], handlers: () => ({}) } as unknown as BusinessInfoTool;
  const cartTools = {
    definitions: [{ name: 'agregar_al_carrito', description: 'x', parameters: {} }],
    handlers: () => ({
      agregar_al_carrito: async (
        args: Record<string, unknown>,
        c: DeliveryTurnContext,
      ): Promise<ToolResult> => {
        if (!c.seenVariantIds.has(String(args.variantId)))
          return { ok: false, error: 'VARIANT_NOT_SEEN' };
        added.push(args);
        return {
          ok: true,
          data: {
            subtotal: 32000,
            lines: [{ lineTotal: 28000 }, { lineTotal: 4000 }],
            text: CART_TEXT,
          },
        };
      },
    }),
  } as unknown as CartTools;
  const matcher = {
    search: jest.fn(async (_m: string, query: string) =>
      matchStatus === 'MATCHED'
        ? {
            status: 'MATCHED',
            query,
            candidate: {
              variantId: 'v-sen',
              productId: 'p1',
              label: 'H',
              unitPrice: 14000,
              score: 1,
            },
          }
        : { status: 'NOT_FOUND', query },
    ),
  } as unknown as CatalogMatcherService;
  const llm = {
    runToolLoop: (p: RunToolLoopParams & { provider?: LlmProvider }) =>
      runToolLoop(p.provider ?? provider, p),
  } as unknown as LlmService;
  const service = new DeliveryAgentService(
    llm,
    catalogTools,
    businessInfo,
    cartTools,
    matcher,
    new GroundingValidator(),
    provider,
  );
  return { service, added, matcher };
}

const turn = (c: DeliveryTurnContext) => ({ ctx: c, merchantName: 'Burger Barrio', history: [] });

describe('DeliveryAgentService (S2.3)', () => {
  it('runs the tool loop and returns a grounded natural reply', async () => {
    const fake = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
      {
        toolCalls: [
          {
            name: 'agregar_al_carrito',
            arguments: { variantId: 'v-sen', cantidad: 2, notas: 'sin cebolla' },
          },
        ],
      },
      { text: '¡Listo! Te anoté 2 hamburguesas sencillas sin cebolla, van $32.000. ¿Algo más?' },
    ]);
    const { service, added } = build(fake);
    const out = await service.handleTurn(turn(ctx()));
    expect(out.text).toContain('$32.000');
    expect(out.fallbackUsed).toBeNull();
    expect(out.toolTrace).toEqual([
      { name: 'buscar_producto', ok: true },
      { name: 'agregar_al_carrito', ok: true },
    ]);
    expect(added).toHaveLength(1);
  });

  it('AC-04: a variantId never returned by a search is rejected and nothing is added', async () => {
    const fake = new FakeLlmProvider([
      {
        toolCalls: [
          { name: 'agregar_al_carrito', arguments: { variantId: 'v-hack', cantidad: 1 } },
        ],
      },
      { text: 'Uy, no pude agregar eso.' },
    ]);
    const { service, added } = build(fake);
    const out = await service.handleTurn(turn(ctx()));
    expect(added).toHaveLength(0);
    expect(out.toolTrace).toEqual([{ name: 'agregar_al_carrito', ok: false }]);
  });

  it('AC-33: invented total → retry → still invalid → presenter fallback with the real figures', async () => {
    const fake = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] },
      {
        toolCalls: [{ name: 'agregar_al_carrito', arguments: { variantId: 'v-sen', cantidad: 2 } }],
      },
      { text: 'El total es $40.000' },
      { text: 'Perdón, son $40.000' },
    ]);
    const { service } = build(fake);
    const out = await service.handleTurn(turn(ctx()));
    expect(out.text).not.toContain('$40.000');
    expect(out.text).toContain(CART_TEXT);
    expect(out.groundingFailures).toBe(2);
    expect(out.fallbackUsed).toBe('GROUNDING');
  });

  it('RN-28: a corrected retry is accepted', async () => {
    const fake = new FakeLlmProvider([
      {
        toolCalls: [{ name: 'agregar_al_carrito', arguments: { variantId: 'v-sen', cantidad: 2 } }],
      },
      { text: 'Van $40.000' },
      { text: 'Van $32.000' },
    ]);
    const { service } = build(fake);
    const out = await service.handleTurn(turn(ctx({ seenVariantIds: new Set(['v-sen']) })));
    expect(out.text).toBe('Van $32.000');
    expect(out.groundingFailures).toBe(1);
  });

  it('AC-07: LLM timeout → deterministic parser + matcher add to the cart, no error', async () => {
    const fake = new FakeLlmProvider([{ failure: 'TIMEOUT' }]);
    const { service, added } = build(fake);
    const out = await service.handleTurn(turn(ctx({ text: '2 hamburguesas sencillas' })));
    expect(out.fallbackUsed).toBe('TIMEOUT');
    expect(added[0]).toMatchObject({ variantId: 'v-sen', cantidad: 2 });
    expect(out.text).toContain(CART_TEXT);
  });

  it('AC-07: LLM timeout and nothing understood → asks to rephrase', async () => {
    const fake = new FakeLlmProvider([{ failure: 'TIMEOUT' }]);
    const { service } = build(fake, 'NOT_FOUND');
    const out = await service.handleTurn(turn(ctx({ text: 'asdf' })));
    expect(out.text).toBe(DELIVERY_TEXTS.retryFallback);
  });

  it('AC-05 base: AMBIGUOUS search candidates are returned for lastCandidates', async () => {
    const fake = new FakeLlmProvider([
      { toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa' } }] },
      {
        text: 'Tenemos sencilla a $16.000, doble a $22.000 y de tocineta a $19.000, ¿cuál te provoca?',
      },
    ]);
    const { service } = build(fake);
    const out = await service.handleTurn(turn(ctx({ text: 'quiero una hamburguesa' })));
    expect(out.candidates?.map((c) => c.variantId)).toEqual(['v-sen', 'v-dob', 'v-toc']);
    expect(out.groundingFailures).toBe(0);
  });

  it('AC-05: "la doble" next turn resolves against fresh lastCandidates (RN-02)', async () => {
    const fake = new FakeLlmProvider([
      {
        toolCalls: [{ name: 'agregar_al_carrito', arguments: { variantId: 'v-dob', cantidad: 1 } }],
      },
      { text: 'Listo, te anoté la doble.' },
    ]);
    const { service, added } = build(fake);
    const now = new Date('2026-11-27T20:00:00-05:00');
    await service.handleTurn({
      ...turn(ctx({ text: 'la doble', now })),
      lastCandidates: {
        items: [
          {
            variantId: 'v-dob',
            productId: 'p2',
            label: 'Hamburguesa doble',
            unitPrice: 22000,
            score: 1,
          },
        ],
        createdAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      },
    });
    expect(added[0]).toMatchObject({ variantId: 'v-dob' });
  });

  it('expired lastCandidates (> 30 min) are ignored', () => {
    const now = new Date('2026-11-27T20:00:00-05:00');
    const items = [{ variantId: 'v1', productId: 'p', label: 'x', unitPrice: 1, score: 1 }];
    expect(
      freshCandidateIds(
        { items, createdAt: new Date(now.getTime() - 31 * 60000).toISOString() },
        now,
      ),
    ).toEqual([]);
    expect(
      freshCandidateIds({ items, createdAt: new Date(now.getTime() - 60000).toISOString() }, now),
    ).toEqual(['v1']);
  });
});
