import { Test, TestingModule } from '@nestjs/testing';
import { RemoveFromCartFlow } from './remove-from-cart.flow';
import { CartService } from '../../services/cart.service';

/**
 * RemoveFromCartFlow Unit Tests
 * AC-10: Test remove from cart conversational flow
 * PR-04: Cart CRUD conversational
 */
describe('AC-10: RemoveFromCartFlow', () => {
  let flow: RemoveFromCartFlow;
  let cartService: jest.Mocked<CartService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoveFromCartFlow,
        {
          provide: CartService,
          useValue: {
            createOrGetActiveCart: jest.fn(),
            getCartSummary: jest.fn(),
            removeItem: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<RemoveFromCartFlow>(RemoveFromCartFlow);
    cartService = module.get(CartService);
  });

  it('AC-10: should remove item', async () => {
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

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('removido');
    expect(cartService.removeItem).toHaveBeenCalled();
  });

  it('should handle empty cart', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({
      items: [],
      total: 0,
      itemCount: 0,
    });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('carrito está vacío');
  });

  it('should handle item not found', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          productName: 'Pantalón',
          variantName: 'Talla L',
          quantity: 1,
          priceSnapshot: 35,
          subtotal: 35,
        },
      ],
      total: 35,
      itemCount: 1,
    });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('No encontré');
  });

  it('should show updated total after removal', async () => {
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
          {
            id: 'item-2',
            productName: 'Pantalón',
            variantName: 'Talla L',
            quantity: 1,
            priceSnapshot: 35,
            subtotal: 35,
          },
        ],
        total: 60,
        itemCount: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-2',
            productName: 'Pantalón',
            variantName: 'Talla L',
            quantity: 1,
            priceSnapshot: 35,
            subtotal: 35,
          },
        ],
        total: 35,
        itemCount: 1,
      });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('removido');
    expect(response).toContain('$35');
  });
});
