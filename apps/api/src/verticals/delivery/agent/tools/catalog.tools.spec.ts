import { CatalogService } from '../../../../services/catalog.service';
import { CategoryRepository } from '../../../../persistence/repositories/category.repository';
import type { ProductWithVariants } from '../../../../persistence/repositories/product.repository';
import { CatalogMatcherService } from '../../catalog/catalog-matcher.service';
import {
  FX,
  FX_CATEGORIES,
  fxProduct,
  fxTurnContext,
} from '../../catalog/testing/catalog.fixtures';
import { MenuPresenter } from '../../presenters/menu.presenter';
import { CatalogTools } from './catalog.tools';

function makeTools(opts: { search?: ProductWithVariants[]; all?: ProductWithVariants[] } = {}) {
  const searchProducts = jest.fn().mockResolvedValue(opts.search ?? []);
  const getByMerchant = jest.fn().mockResolvedValue(opts.all ?? []);
  const catalog = { searchProducts, getByMerchant } as unknown as CatalogService;
  const findByMerchant = jest.fn().mockResolvedValue(FX_CATEGORIES);
  const categories = { findByMerchant } as unknown as CategoryRepository;
  const tools = new CatalogTools(
    new CatalogMatcherService(catalog),
    catalog,
    categories,
    new MenuPresenter(),
  );
  return { tools, handlers: tools.handlers(), searchProducts, getByMerchant };
}

describe('CatalogTools definitions', () => {
  it('expone buscar_producto y ver_menu con JSON Schema y un handler por definición', () => {
    const { tools, handlers } = makeTools();
    expect(tools.definitions.map((d) => d.name)).toEqual(['buscar_producto', 'ver_menu']);
    expect(tools.definitions[0].parameters).toMatchObject({ type: 'object', required: ['query'] });
    expect(Object.keys(handlers).sort()).toEqual(['buscar_producto', 'ver_menu']);
  });
});

describe('buscar_producto', () => {
  it('AC-05 base: AMBIGUOUS con las 3 hamburguesas y registra los variantIds vistos (RN-02)', async () => {
    const { handlers } = makeTools({ search: [FX.sencilla, FX.doble, FX.tocineta] });
    const ctx = fxTurnContext();
    const r = await handlers.buscar_producto({ query: 'hamburguesa' }, ctx);
    expect(r).toEqual({
      ok: true,
      data: {
        status: 'AMBIGUOUS',
        query: 'hamburguesa',
        cantidad: null,
        candidates: [
          { variantId: 'v_sen', label: 'Hamburguesa sencilla', unitPrice: 16000 },
          { variantId: 'v_dob', label: 'Hamburguesa doble', unitPrice: 22000 },
          { variantId: 'v_toc', label: 'Hamburguesa de tocineta', unitPrice: 19000 },
        ],
      },
    });
    expect([...ctx.seenVariantIds]).toEqual(['v_sen', 'v_dob', 'v_toc']);
  });

  it('MATCHED con cantidad', async () => {
    const { handlers } = makeTools({ search: [FX.coca] });
    const ctx = fxTurnContext();
    const r = await handlers.buscar_producto({ query: 'coca 400', cantidad: 2 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      status: 'MATCHED',
      cantidad: 2,
      candidates: [{ variantId: 'v_coca400' }],
    });
    expect(ctx.seenVariantIds.has('v_coca400')).toBe(true);
    expect(ctx.seenVariantIds.has('v_coca1500')).toBe(false);
  });

  it('AC-06 base: "sushi" → NOT_FOUND sin candidatos ni ids vistos', async () => {
    const { handlers } = makeTools({ search: [] });
    const ctx = fxTurnContext();
    const r = await handlers.buscar_producto({ query: 'sushi' }, ctx);
    expect(r).toEqual({
      ok: true,
      data: { status: 'NOT_FOUND', query: 'sushi', cantidad: null, candidates: [] },
    });
    expect(ctx.seenVariantIds.size).toBe(0);
  });

  it('argumentos inválidos → ok:false sin lanzar', async () => {
    const { handlers, searchProducts } = makeTools();
    expect(await handlers.buscar_producto({}, fxTurnContext())).toEqual({
      ok: false,
      error: 'QUERY_REQUERIDA',
    });
    expect(await handlers.buscar_producto({ query: 'x', cantidad: 0 }, fxTurnContext())).toEqual({
      ok: false,
      error: 'CANTIDAD_INVALIDA',
    });
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it('error de BD → ok:false ERROR_CATALOGO (nunca lanza)', async () => {
    const { handlers, searchProducts } = makeTools();
    searchProducts.mockRejectedValueOnce(new Error('db down'));
    expect(await handlers.buscar_producto({ query: 'x' }, fxTurnContext())).toEqual({
      ok: false,
      error: 'ERROR_CATALOGO',
    });
  });
});

describe('ver_menu', () => {
  const agotado = fxProduct('p_ag', 'Malteada', 'c_beb', [
    { id: 'v_ag', name: '12 oz', price: 9000, isActive: false },
  ]);
  const all = [FX.coca, FX.sencilla, FX.doble, FX.papas, agotado];

  it('AC-09: categorías con productos activos y precios de la BD (sin agotados)', async () => {
    const { handlers, getByMerchant } = makeTools({ all });
    const r = await handlers.ver_menu({}, fxTurnContext());
    expect(getByMerchant).toHaveBeenCalledWith('m1');
    expect(r.ok).toBe(true);
    const data = r.data as {
      texto: string;
      pagina: number;
      totalPaginas: number;
      categorias: string[];
    };
    expect(data.texto).toBe(
      [
        '*Hamburguesas*',
        '• Hamburguesa doble — $22.000',
        '• Hamburguesa sencilla — $16.000',
        '',
        '*Bebidas*',
        '• Coca-Cola 1.5 L — $8.000',
        '• Coca-Cola 400 ml — $4.000',
        '',
        '*Adiciones*',
        '• Papas fritas — $6.000',
      ].join('\n'),
    );
    expect(data).toMatchObject({ pagina: 1, totalPaginas: 1, imagenMenuUrl: null });
    expect(data.categorias).toEqual(['Hamburguesas', 'Bebidas', 'Adiciones']);
    expect(data.texto).not.toContain('Malteada');
  });

  it('filtra por categoría (singular/plural, sin tildes)', async () => {
    const { handlers } = makeTools({ all });
    const r = await handlers.ver_menu({ categoria: 'bebida' }, fxTurnContext());
    expect((r.data as { texto: string }).texto.startsWith('*Bebidas*')).toBe(true);
    expect((r.data as { texto: string }).texto).not.toContain('Hamburguesa');
  });

  it('categoría inexistente → ok:false con las categorías disponibles', async () => {
    const { handlers } = makeTools({ all });
    expect(await handlers.ver_menu({ categoria: 'sushi' }, fxTurnContext())).toEqual({
      ok: false,
      error: 'CATEGORIA_NO_ENCONTRADA',
      data: { categorias: ['Hamburguesas', 'Bebidas', 'Adiciones'] },
    });
  });

  it('con trackStock oculta variantes sin stock', async () => {
    const sinStock = fxProduct('p_ss', 'Agua', 'c_beb', [
      { id: 'v_ss', name: '600 ml', price: 3000 },
    ]);
    sinStock.variants[0].stock = 0;
    const { handlers } = makeTools({ all: [sinStock, FX.coca] });
    const ctx = fxTurnContext();
    ctx.config.trackStock = true;
    const r = await handlers.ver_menu({}, ctx);
    expect((r.data as { texto: string }).texto).not.toContain('Agua');
  });

  it('menú vacío o error de BD → ok:false sin lanzar', async () => {
    const { handlers, getByMerchant } = makeTools({ all: [] });
    expect(await handlers.ver_menu({}, fxTurnContext())).toEqual({
      ok: false,
      error: 'MENU_VACIO',
    });
    getByMerchant.mockRejectedValueOnce(new Error('db down'));
    expect(await handlers.ver_menu({}, fxTurnContext())).toEqual({
      ok: false,
      error: 'ERROR_CATALOGO',
    });
  });
});
