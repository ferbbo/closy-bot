import { Test, TestingModule } from '@nestjs/testing';
import { CartFlow } from './cart.flow';
import { CartService } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';

/**
 * CartFlow Unit Tests
 * PR-04: Tests for conversational cart operations
 */
describe('CartFlow', () => {
  let flow: CartFlow;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartFlow,
        {
          provide: CartService,
          useValue: {
            createOrGetActiveCart: jest.fn(),
            addItem: jest.fn(),
            getCartSummary: jest.fn(),
            removeItem: jest.fn(),
            clearCart: jest.fn(),
          },
        },
        {
          provide: CatalogService,
          useValue: {
            searchProducts: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<CartFlow>(CartFlow);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
  });

  describe('AC-10: handleAddToCart', () => {
    it('should add item via conversation', async () => {
      const mockCart = { id: 'cart-1', items: [] };
      const mockProduct = {
        id: 'product-1',
        name: 'Camiseta Roja',
        variants: [
          {
            id: 'variant-1',
            name: 'Talla M',
            price: { toNumber: () => 25 },
            stock: 10,
            isActive: true,
          },
        ],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue(mockCart as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      catalogService.searchProducts.mockResolvedValue([mockProduct as any]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.addItem.mockResolvedValue(mockCart as any);
      cartService.getCartSummary.mockResolvedValue({
        items: [],
        total: 25,
        itemCount: 1,
      });

      const response = await flow.handleAddToCart('customer-1', 'merchant-1', 'camiseta roja');

      expect(response).toContain('Agregado al carrito');
      expect(response).toContain('Camiseta Roja');
      expect(cartService.addItem).toHaveBeenCalled();
    });

    it('should handle no results', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      catalogService.searchProducts.mockResolvedValue([]);

      const response = await flow.handleAddToCart(
        'customer-1',
        'merchant-1',
        'producto inexistente',
      );

      expect(response).toContain('No encontré');
    });
  });

  describe('AC-11: handleShowCart', () => {
    it('should show cart summary', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      cartService.getCartSummary.mockResolvedValue({
        items: [
          {
            id: 'item-1',
            productName: 'Camiseta',
            variantName: 'Talla M',
            quantity: 2,
            priceSnapshot: 25,
            subtotal: 50,
          },
        ],
        total: 50,
        itemCount: 2,
      });

      const response = await flow.handleShowCart('customer-1', 'merchant-1');

      expect(response).toContain('Tu carrito');
      expect(response).toContain('Camiseta');
      expect(response).toContain('$50');
    });

    it('should handle empty cart', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      cartService.getCartSummary.mockResolvedValue({
        items: [],
        total: 0,
        itemCount: 0,
      });

      const response = await flow.handleShowCart('customer-1', 'merchant-1');

      expect(response).toContain('carrito está vacío');
    });
  });

  describe('AC-12: handleRemoveItem', () => {
    it('should remove item via conversation', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      cartService.getCartSummary
        .mockResolvedValueOnce({
          items: [
            {
              id: 'item-1',
              productName: 'Camiseta',
              variantName: 'Talla M',
              quantity: 1,
              priceSnapshot: 25,
              subtotal: 25,
            },
          ],
          total: 25,
          itemCount: 1,
        })
        .mockResolvedValueOnce({
          items: [],
          total: 0,
          itemCount: 0,
        });

      const response = await flow.handleRemoveItem('customer-1', 'merchant-1', 'camiseta');

      expect(response).toContain('removido');
      expect(cartService.removeItem).toHaveBeenCalled();
    });
  });
});
