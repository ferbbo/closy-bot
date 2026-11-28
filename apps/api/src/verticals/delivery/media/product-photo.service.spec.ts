import type { CatalogMatcherService } from '../catalog/catalog-matcher.service';
import type { MatchResult, VariantCandidate } from '../contracts';
import { ProductPhotoResolver } from './product-photo.service';

const cand = (variantId: string, label: string, unitPrice: number): VariantCandidate => ({
  variantId,
  productId: `p-${variantId}`,
  label,
  unitPrice,
  score: 1,
});

describe('ProductPhotoResolver (S5.3-T2)', () => {
  const setup = (results: Record<string, MatchResult | Error>) => {
    const matcher = {
      search: jest.fn(async (_m: string, query: string) => {
        const r = results[query];
        if (r instanceof Error) throw r;
        return r ?? { status: 'NOT_FOUND', query };
      }),
    };
    return {
      matcher,
      resolver: new ProductPhotoResolver(matcher as unknown as CatalogMatcherService),
    };
  };

  it('matches every item in the catalog and attaches the suggested quantity (no cart access)', async () => {
    const { resolver, matcher } = setup({
      'hamburguesa tocineta': {
        status: 'MATCHED',
        query: 'hamburguesa tocineta',
        candidate: cand('v-toc', 'Hamburguesa de tocineta', 19000),
      },
      coca: {
        status: 'AMBIGUOUS',
        query: 'coca',
        candidates: [
          cand('v-c4', 'Coca-Cola 400 ml', 4000),
          cand('v-c15', 'Coca-Cola 1.5 L', 8000),
        ],
      },
    });
    const res = await resolver.resolve(
      'm1',
      [
        { query: 'hamburguesa tocineta', quantity: 2 },
        { query: 'coca', quantity: null },
      ],
      'quiero esto',
    );

    expect(matcher.search).toHaveBeenCalledWith('m1', 'hamburguesa tocineta', 5);
    expect(res.status).toBe('FOUND');
    if (res.status !== 'FOUND') return;
    expect(res.candidates.map((c) => [c.variantId, c.suggestedQuantity, c.unitPrice])).toEqual([
      ['v-toc', 2, 19000],
      ['v-c4', null, 4000],
      ['v-c15', null, 8000],
    ]);
    expect(res.echo).toBe('📷 En tu foto veo: hamburguesa tocineta ×2, coca');
    expect(res.agentText).toContain('2 × hamburguesa tocineta; coca');
    expect(res.agentText).toContain('No agregues nada al carrito');
    expect(res.agentText).toContain('"quiero esto"');
    // RN-00: el texto para el agente no lleva precios; los da buscar_producto
    expect(res.agentText).not.toMatch(/19\.?000|\$/);
  });

  it('skips items without matches and returns NOT_FOUND when none match', async () => {
    const { resolver } = setup({ sushi: new Error('db down') });
    await expect(
      resolver.resolve('m1', [
        { query: 'sushi', quantity: 1 },
        { query: 'ramen', quantity: null },
      ]),
    ).resolves.toEqual({ status: 'NOT_FOUND' });
  });

  it('only echoes the items that matched and dedupes candidates by variantId', async () => {
    const toc = cand('v-toc', 'Hamburguesa de tocineta', 19000);
    const { resolver } = setup({
      'hamburguesa tocineta': { status: 'MATCHED', query: 'hamburguesa tocineta', candidate: toc },
      'burger bacon': { status: 'MATCHED', query: 'burger bacon', candidate: toc },
    });
    const res = await resolver.resolve('m1', [
      { query: 'hamburguesa tocineta', quantity: 1 },
      { query: 'sushi', quantity: 3 },
      { query: 'burger bacon', quantity: 2 },
    ]);
    if (res.status !== 'FOUND') throw new Error('expected FOUND');
    expect(res.candidates).toHaveLength(1);
    expect(res.echo).not.toContain('sushi');
  });
});
