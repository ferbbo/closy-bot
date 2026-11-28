import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { CartService } from '../../../../services/cart.service';
import type { CartItemRepository } from '../../../../persistence/repositories/cart-item.repository';
import type { ProductRepository } from '../../../../persistence/repositories/product.repository';
import type { CartWithItems } from '../../../../persistence/repositories/cart.repository';
import { buildRestauranteDefaults } from '../../config/restaurante.defaults';
import { CartPresenter } from '../../presenters/cart.presenter';
import type { DeliveryTurnContext } from '../../contracts';
import { CartTools } from './cart.tools';

const line = (id: string, variantId: string, notes: string, quantity: number, price = 16000) => ({
  id,
  cartId: 'cart-1',
  variantId,
  notes,
  quantity,
  priceSnapshot: new Decimal(price),
  variant: {
    id: variantId,
    name: 'Única',
    price: new Decimal(price),
    productId: 'p-1',
    product: { id: 'p-1', name: 'Hamburguesa sencilla' },
  },
});
const cartOf = (items: ReturnType<typeof line>[]) =>
  ({ id: 'cart-1', items }) as unknown as CartWithItems;

describe('CartTools (S2.2-T3)', () => {
  let cartService: jest.Mocked<
    Pick<CartService, 'createOrGetActiveCart' | 'addItem' | 'removeItem' | 'getCart'>
  >;
  let cartItemRepository: { updateQuantity: jest.Mock };
  let productRepository: { findByVariantId: jest.Mock };
  let tools: CartTools;
  let ctx: DeliveryTurnContext;

  const product = (overrides: { isActive?: boolean; merchantId?: string } = {}) => ({
    id: 'p-1',
    name: 'Hamburguesa sencilla',
    merchantId: overrides.merchantId ?? 'm-1',
    isActive: true,
    variants: [{ id: 'v-1', name: 'Única', isActive: overrides.isActive ?? true, stock: 0 }],
  });

  beforeEach(() => {
    cartService = {
      createOrGetActiveCart: jest.fn().mockResolvedValue(cartOf([])),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      getCart: jest.fn(),
    };
    cartItemRepository = { updateQuantity: jest.fn() };
    productRepository = { findByVariantId: jest.fn().mockResolvedValue(product()) };
    tools = new CartTools(
      cartService as unknown as CartService,
      cartItemRepository as unknown as CartItemRepository,
      productRepository as unknown as ProductRepository,
      new CartPresenter(),
    );
    ctx = {
      merchantId: 'm-1',
      customerId: 'c-1',
      conversationId: 'conv-1',
      customerPhone: '+573000000101',
      text: '',
      config: buildRestauranteDefaults(),
      now: new Date(),
      seenVariantIds: new Set(['v-1']),
    };
  });

  const run = (name: string, args: Record<string, unknown>) => tools.handlers()[name](args, ctx);

  it('expone las 3 definiciones con nombres estables y un handler por cada una', () => {
    const names = tools.definitions.map((d) => d.name);
    expect(names).toEqual(['agregar_al_carrito', 'quitar_del_carrito', 'ver_carrito']);
    expect(Object.keys(tools.handlers()).sort()).toEqual([...names].sort());
  });

  describe('agregar_al_carrito', () => {
    it('AC-04 (RN-02): variantId no visto en el turno → VARIANT_NOT_SEEN y el carrito no cambia', async () => {
      const result = await run('agregar_al_carrito', { variantId: 'v-x', cantidad: 1 });

      expect(result).toEqual({ ok: false, error: 'VARIANT_NOT_SEEN' });
      expect(cartService.addItem).not.toHaveBeenCalled();
      expect(cartService.createOrGetActiveCart).not.toHaveBeenCalled();
      expect(productRepository.findByVariantId).not.toHaveBeenCalled();
    });

    it('AC-03/AC-08: agrega con notas, sin stock (trackStock=false) y devuelve CartView del presenter', async () => {
      cartService.addItem.mockResolvedValue(
        cartOf([line('i-1', 'v-1', 'sin cebolla', 2), line('i-2', 'v-1', '', 1)]),
      );

      const result = await run('agregar_al_carrito', {
        variantId: 'v-1',
        cantidad: 2,
        notas: ' Sin cebolla ',
      });

      expect(cartService.addItem).toHaveBeenCalledWith('c-1', 'm-1', 'v-1', 2, {
        notes: 'sin cebolla',
        skipStockCheck: true,
      });
      expect(result.ok).toBe(true);
      const data = result.data as { lines: unknown[]; subtotal: number; text: string };
      expect(data.lines).toHaveLength(2);
      expect(data.subtotal).toBe(48000);
      expect(data.text).toContain('2× Hamburguesa sencilla (sin cebolla) — $32.000');
      expect(data.text).toContain('Subtotal: $48.000');
    });

    it('trackStock=true → no omite el chequeo; stock insuficiente → OUT_OF_STOCK', async () => {
      ctx.config = { ...ctx.config, trackStock: true };
      cartService.addItem.mockRejectedValue(new BadRequestException('Stock insuficiente'));

      const result = await run('agregar_al_carrito', { variantId: 'v-1', cantidad: 1 });

      expect(cartService.addItem.mock.calls[0][4]).toEqual({ notes: '', skipStockCheck: false });
      expect(result).toEqual({ ok: false, error: 'OUT_OF_STOCK' });
    });

    it.each([0, 21, 1.5, 'dos', undefined])(
      'RN-03: cantidad inválida (%p) → INVALID_QUANTITY',
      async (cantidad) => {
        const result = await run('agregar_al_carrito', { variantId: 'v-1', cantidad });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('INVALID_QUANTITY');
        expect(cartService.addItem).not.toHaveBeenCalled();
      },
    );

    it('RN-03: la línea existente no puede superar maxQtyPerLine', async () => {
      cartService.createOrGetActiveCart.mockResolvedValue(cartOf([line('i-1', 'v-1', '', 19)]));
      const result = await run('agregar_al_carrito', { variantId: 'v-1', cantidad: 2 });
      expect(result.error).toBe('INVALID_QUANTITY');
      expect(cartService.addItem).not.toHaveBeenCalled();
    });

    it('RN-03: no crea una línea nueva si ya hay maxLines', async () => {
      ctx.config = { ...ctx.config, maxLines: 2 };
      cartService.createOrGetActiveCart.mockResolvedValue(
        cartOf([line('i-1', 'v-1', '', 1), line('i-2', 'v-1', 'sin salsa', 1)]),
      );
      const result = await run('agregar_al_carrito', {
        variantId: 'v-1',
        cantidad: 1,
        notas: 'doble queso',
      });
      expect(result).toEqual({ ok: false, error: 'MAX_LINES', data: { maxLines: 2 } });
    });

    it('RN-04: variante inactiva (agotada) → VARIANT_INACTIVE', async () => {
      productRepository.findByVariantId.mockResolvedValue(product({ isActive: false }));
      const result = await run('agregar_al_carrito', { variantId: 'v-1', cantidad: 1 });
      expect(result).toEqual({ ok: false, error: 'VARIANT_INACTIVE' });
    });

    it('variante de otro comercio → VARIANT_NOT_FOUND', async () => {
      productRepository.findByVariantId.mockResolvedValue(product({ merchantId: 'm-2' }));
      const result = await run('agregar_al_carrito', { variantId: 'v-1', cantidad: 1 });
      expect(result).toEqual({ ok: false, error: 'VARIANT_NOT_FOUND' });
    });

    it('nunca lanza: un error inesperado → CART_ERROR', async () => {
      productRepository.findByVariantId.mockRejectedValue(new Error('db down'));
      const result = await run('agregar_al_carrito', { variantId: 'v-1', cantidad: 1 });
      expect(result).toEqual({ ok: false, error: 'CART_ERROR' });
    });
  });
});
