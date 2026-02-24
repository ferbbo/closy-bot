import { Test, TestingModule } from '@nestjs/testing';
import { ViewCartFlow } from './view-cart.flow';
import { CartService } from '../../services/cart.service';

/**
 * ViewCartFlow Unit Tests
 * AC-08: Test view cart conversational flow
 * PR-04: Cart CRUD conversational
 */
describe('AC-08: ViewCartFlow', () => {
  let flow: ViewCartFlow;
  let cartService: jest.Mocked<CartService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViewCartFlow,
        {
          provide: CartService,
          useValue: {
            createOrGetActiveCart: jest.fn(),
            getCartSummary: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<ViewCartFlow>(ViewCartFlow);
    cartService = module.get(CartService);
  });

  it('AC-08: should format cart summary', async () => {
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

    const response = await flow.execute('customer-1', 'merchant-1');

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

    const response = await flow.execute('customer-1', 'merchant-1');

    expect(response).toContain('carrito está vacío');
  });

  it('should show multiple items correctly', async () => {
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
        {
          id: 'item-2',
          productName: 'Pantalón',
          variantName: 'Talla L',
          quantity: 1,
          priceSnapshot: 35,
          subtotal: 35,
        },
      ],
      total: 85,
      itemCount: 3,
    });

    const response = await flow.execute('customer-1', 'merchant-1');

    expect(response).toContain('Tu carrito');
    expect(response).toContain('Camiseta');
    expect(response).toContain('Pantalón');
    expect(response).toContain('$85');
  });
});
