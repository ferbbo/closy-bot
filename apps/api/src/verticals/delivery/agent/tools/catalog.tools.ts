import { Injectable, Logger } from '@nestjs/common';
import { CatalogService } from '../../../../services/catalog.service';
import { CategoryRepository } from '../../../../persistence/repositories/category.repository';
import {
  CatalogMatcherService,
  tokenize,
  variantLabel,
} from '../../catalog/catalog-matcher.service';
import { DeliveryTurnContext, LlmToolDef, ToolHandler, ToolResult } from '../../contracts';
import { MenuCategoryView, MenuPresenter } from '../../presenters/menu.presenter';

function optionalPositiveInt(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : 'invalid';
}

/**
 * Herramientas de catálogo del agente: `buscar_producto` y `ver_menu`.
 * Todo se lee de la BD en el turno (RN-00); los handlers nunca lanzan.
 */
@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'buscar_producto',
      description:
        'Busca un producto de la carta por texto libre. Devuelve candidatos con variantId y precio de la BD. Úsala antes de agregar al carrito.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Producto tal como lo pide el cliente, sin cantidad. Ej: "coca 400"' },
          cantidad: { type: 'integer', minimum: 1, description: 'Cantidad pedida, si la dijo' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      name: 'ver_menu',
      description: 'Muestra la carta (categorías, productos activos y precios de la BD), paginada.',
      parameters: {
        type: 'object',
        properties: {
          categoria: { type: 'string', description: 'Filtrar por categoría. Ej: "bebidas"' },
          pagina: { type: 'integer', minimum: 1, description: 'Página a mostrar (desde 1)' },
        },
        additionalProperties: false,
      },
    },
  ]; // prettier-ignore

  constructor(
    private readonly matcher: CatalogMatcherService,
    private readonly catalogService: CatalogService,
    private readonly categoryRepository: CategoryRepository,
    private readonly menuPresenter: MenuPresenter,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return {
      buscar_producto: (args, ctx) => this.buscarProducto(args, ctx),
      ver_menu: (args, ctx) => this.verMenu(args, ctx),
    };
  }

  private async buscarProducto(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, error: 'QUERY_REQUERIDA' };
    const cantidad = optionalPositiveInt(args.cantidad);
    if (cantidad === 'invalid') return { ok: false, error: 'CANTIDAD_INVALIDA' };
    try {
      const result = await this.matcher.search(ctx.merchantId, query, 5);
      const found =
        result.status === 'MATCHED'
          ? [result.candidate]
          : result.status === 'AMBIGUOUS'
            ? result.candidates
            : [];
      for (const c of found) ctx.seenVariantIds.add(c.variantId); // RN-02
      return {
        ok: true,
        data: {
          status: result.status,
          query,
          cantidad,
          candidates: found.map((c) => ({
            variantId: c.variantId,
            label: c.label,
            unitPrice: c.unitPrice,
          })),
        },
      };
    } catch (error) {
      this.logger.error(`buscar_producto failed: ${(error as Error).message}`);
      return { ok: false, error: 'ERROR_CATALOGO' };
    }
  }

  private async verMenu(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const pagina = optionalPositiveInt(args.pagina);
    if (pagina === 'invalid') return { ok: false, error: 'PAGINA_INVALIDA' };
    const categoria = typeof args.categoria === 'string' ? args.categoria.trim() : '';
    try {
      const all = await this.loadMenu(ctx);
      const nombres = all.map((c) => c.name);
      let selected = all;
      if (categoria) {
        const wanted = new Set(tokenize(categoria));
        selected = all.filter((c) => tokenize(c.name).some((t) => wanted.has(t)));
        if (selected.length === 0) {
          return { ok: false, error: 'CATEGORIA_NO_ENCONTRADA', data: { categorias: nombres } };
        }
      }
      const page = this.menuPresenter.render(selected, pagina ?? 1);
      if (!page) return { ok: false, error: 'MENU_VACIO' };
      return {
        ok: true,
        data: {
          texto: page.text,
          pagina: page.page,
          totalPaginas: page.totalPages,
          categorias: nombres,
          imagenMenuUrl: ctx.config.menuImageUrl ?? null,
        },
      };
    } catch (error) {
      this.logger.error(`ver_menu failed: ${(error as Error).message}`);
      return { ok: false, error: 'ERROR_CATALOGO' };
    }
  }

  /** Categorías con productos y variantes activos (y con stock si `trackStock`). Lectura en el turno. */
  private async loadMenu(ctx: DeliveryTurnContext): Promise<MenuCategoryView[]> {
    const [categories, products] = await Promise.all([
      this.categoryRepository.findByMerchant(ctx.merchantId),
      this.catalogService.getByMerchant(ctx.merchantId),
    ]);
    return categories
      .map((cat) => ({
        name: cat.name,
        items: products
          .filter((p) => p.categoryId === cat.id && p.isActive)
          .flatMap((p) =>
            p.variants
              .filter((v) => v.isActive && (!ctx.config.trackStock || v.stock > 0))
              .map((v) => ({ label: variantLabel(p.name, v.name), unitPrice: Number(v.price) })),
          )
          .sort((a, b) => a.label.localeCompare(b.label, 'es')),
      }))
      .filter((c) => c.items.length > 0);
  }
}
