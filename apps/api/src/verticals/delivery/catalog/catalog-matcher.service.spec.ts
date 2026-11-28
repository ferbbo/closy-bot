import { CatalogService } from '../../../services/catalog.service';
import type { ProductWithVariants } from '../../../persistence/repositories/product.repository';
import { CatalogMatcherService, tokenize, variantLabel } from './catalog-matcher.service';
import { FX, fxProduct } from './testing/catalog.fixtures';

function makeMatcher(products: ProductWithVariants[]) {
  const searchProducts = jest.fn().mockResolvedValue(products);
  const catalog = { searchProducts } as unknown as CatalogService;
  return { matcher: new CatalogMatcherService(catalog), searchProducts };
}

describe('variantLabel / tokenize', () => {
  it('omite variantes genéricas (Única, Único, Porción)', () => {
    expect(variantLabel('Hamburguesa sencilla', 'Única')).toBe('Hamburguesa sencilla');
    expect(variantLabel('Perro sencillo', 'Único')).toBe('Perro sencillo');
    expect(variantLabel('Papas fritas', 'Porción')).toBe('Papas fritas');
    expect(variantLabel('Coca-Cola', '400 ml')).toBe('Coca-Cola 400 ml');
  });

  it('normaliza, quita palabras vacías y singulariza', () => {
    expect(tokenize('2 Hamburguesas SENCILLAS de la casa')).toEqual([
      '2',
      'hamburguesa',
      'sencilla',
      'casa',
    ]);
  });
});

describe('CatalogMatcherService.search', () => {
  it('reutiliza CatalogService.searchProducts con merchantId y límite', async () => {
    const { matcher, searchProducts } = makeMatcher([FX.sencilla]);
    await matcher.search('m1', ' hamburguesa sencilla ', 3);
    expect(searchProducts).toHaveBeenCalledWith('m1', 'hamburguesa sencilla', 3);
  });

  it('AC-05 base: "hamburguesa" con 3 tipos → AMBIGUOUS con las 3 y su precio de la BD', async () => {
    const { matcher } = makeMatcher([FX.sencilla, FX.doble, FX.tocineta]);
    const r = await matcher.search('m1', 'hamburguesa');
    expect(r.status).toBe('AMBIGUOUS');
    if (r.status !== 'AMBIGUOUS') return;
    expect(r.candidates.map((c) => [c.label, c.unitPrice])).toEqual([
      ['Hamburguesa sencilla', 16000],
      ['Hamburguesa doble', 22000],
      ['Hamburguesa de tocineta', 19000],
    ]);
  });

  it('"hamburguesas sencillas" → MATCHED a la sencilla (margen claro)', async () => {
    const { matcher } = makeMatcher([FX.sencilla, FX.doble, FX.tocineta]);
    const r = await matcher.search('m1', 'hamburguesas sencillas');
    expect(r).toEqual({
      status: 'MATCHED',
      query: 'hamburguesas sencillas',
      candidate: {
        variantId: 'v_sen',
        productId: 'p_sen',
        label: 'Hamburguesa sencilla',
        unitPrice: 16000,
        score: 1,
      },
    });
  });

  it('"coca 400" → MATCHED a la variante 400 ml por el texto de variante', async () => {
    const { matcher } = makeMatcher([FX.coca]);
    const r = await matcher.search('m1', 'coca 400');
    expect(r.status).toBe('MATCHED');
    if (r.status === 'MATCHED') {
      expect(r.candidate.variantId).toBe('v_coca400');
      expect(r.candidate.label).toBe('Coca-Cola 400 ml');
    }
  });

  it('"coca" → AMBIGUOUS entre 400 ml y 1.5 L', async () => {
    const { matcher } = makeMatcher([FX.coca]);
    const r = await matcher.search('m1', 'coca');
    expect(r.status).toBe('AMBIGUOUS');
    if (r.status === 'AMBIGUOUS') {
      expect(r.candidates.map((c) => c.variantId)).toEqual(['v_coca400', 'v_coca1500']);
    }
  });

  it('un solo candidato aunque el puntaje sea bajo → MATCHED', async () => {
    const { matcher } = makeMatcher([FX.papas]);
    const r = await matcher.search('m1', 'papitas');
    expect(r.status).toBe('MATCHED');
  });

  it('AC-06 base: sin resultados ("sushi") → NOT_FOUND', async () => {
    const { matcher } = makeMatcher([]);
    expect(await matcher.search('m1', 'sushi')).toEqual({ status: 'NOT_FOUND', query: 'sushi' });
  });

  it('consulta vacía → NOT_FOUND sin consultar la BD', async () => {
    const { matcher, searchProducts } = makeMatcher([FX.sencilla]);
    expect((await matcher.search('m1', '   ')).status).toBe('NOT_FOUND');
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it('descarta variantes y productos inactivos (agotados)', async () => {
    const agotado = fxProduct('p_x', 'Hamburguesa ranchera', 'c_ham', [
      { id: 'v_x', name: 'Única', price: 21000, isActive: false },
    ]);
    const inactivo = fxProduct('p_y', 'Hamburguesa vegana', 'c_ham', [
      { id: 'v_y', name: 'Única', price: 20000 },
    ], { isActive: false }); // prettier-ignore
    const { matcher } = makeMatcher([agotado, inactivo]);
    expect((await matcher.search('m1', 'hamburguesa')).status).toBe('NOT_FOUND');
  });

  it('descarta ruido de puntaje 0 cuando hay candidatos con coincidencia', async () => {
    const { matcher } = makeMatcher([FX.papas, FX.doble]);
    const r = await matcher.search('m1', 'hamburguesa doble');
    expect(r.status).toBe('MATCHED');
    if (r.status === 'MATCHED') expect(r.candidate.variantId).toBe('v_dob');
  });

  it('AMBIGUOUS devuelve como máximo 5 candidatos', async () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      fxProduct(`p${i}`, `Combo ${i}`, 'c', [
        { id: `v${i}a`, name: 'Personal', price: 10000 },
        { id: `v${i}b`, name: 'Familiar', price: 30000 },
      ]),
    );
    const { matcher } = makeMatcher(many);
    const r = await matcher.search('m1', 'combo', 10);
    expect(r.status).toBe('AMBIGUOUS');
    if (r.status === 'AMBIGUOUS') expect(r.candidates).toHaveLength(5);
  });

  it('el precio es el actual de la BD en cada llamada (sin caché, AC-40 base)', async () => {
    const { matcher, searchProducts } = makeMatcher([FX.sencilla]);
    await matcher.search('m1', 'hamburguesa sencilla');
    searchProducts.mockResolvedValueOnce([
      fxProduct('p_sen', 'Hamburguesa sencilla', 'c_ham', [
        { id: 'v_sen', name: 'Única', price: 17000 },
      ]),
    ]);
    const r = await matcher.search('m1', 'hamburguesa sencilla');
    expect(r.status === 'MATCHED' && r.candidate.unitPrice).toBe(17000);
    expect(searchProducts).toHaveBeenCalledTimes(2);
  });
});
