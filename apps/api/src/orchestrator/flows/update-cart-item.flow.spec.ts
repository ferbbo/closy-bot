import { Test, TestingModule } from '@nestjs/testing';
import { UpdateCartItemFlow } from './update-cart-item.flow';
import { CartService } from '../../services/cart.service';

/**
 * UpdateCartItemFlow Unit Tests
 * AC-09: Test update cart item conversational flow
 * PR-04: Cart CRUD conversational
 */
describe('AC-09: UpdateCartItemFlow', () => {
  let flow: UpdateCartItemFlow;
  let cartService: jest.Mocked<CartService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCartItemFlow,
        {
          provide: CartService,
          useValue: {
            createOrGetActiveCart: jest.fn(),
            getCartSummary: jest.fn(),
            updateQuantity: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<UpdateCartItemFlow>(UpdateCartItemFlow);
    cartService = module.get(CartService);
  });

  it('AC-09: should update quantity', async () => {
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
        items: [
          {
            id: 'item-1',
            productName: 'Camiseta',
            variantName: 'Talla M',
            quantity: 3,
            priceSnapshot: 25,
            subtotal: 75,
          },
        ],
        total: 75,
        itemCount: 3,
      });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta', 3);

    expect(response).toContain('Cantidad actualizada');
    expect(response).toContain('3 unidades');
    expect(cartService.updateQuantity).toHaveBeenCalled();
  });

  it('should handle empty cart', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({
      items: [],
      total: 0,
      itemCount: 0,
    });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta', 3);

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

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta', 3);

    expect(response).toContain('No encontré');
  });

  it('should validate quantity range', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({
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
    });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta', 100);

    expect(response).toContain('La cantidad debe estar entre 1 y 99');
  });
});
