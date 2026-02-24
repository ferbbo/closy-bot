import { Test, TestingModule } from '@nestjs/testing';
import { AddToCartFlow } from './add-to-cart.flow';
import { CartService } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';

/**
 * AddToCartFlow Unit Tests
 * AC-07: Test add-to-cart conversational flow
 * PR-04: Cart CRUD conversational
 */
describe('AC-07: AddToCartFlow', () => {
  let flow: AddToCartFlow;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddToCartFlow,
        {
          provide: CartService,
          useValue: {
            addItem: jest.fn(),
            getCartSummary: jest.fn(),
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

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
  });

  it('AC-07: should add item and return confirmation', async () => {
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
    catalogService.searchProducts.mockResolvedValue([mockProduct as any]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.addItem.mockResolvedValue(mockCart as any);
    cartService.getCartSummary.mockResolvedValue({
      items: [],
      total: 25,
      itemCount: 1,
    });

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta roja');

    expect(response).toContain('Agregado al carrito');
    expect(response).toContain('Camiseta Roja');
    expect(cartService.addItem).toHaveBeenCalled();
  });

  it('should handle no results', async () => {
    catalogService.searchProducts.mockResolvedValue([]);

    const response = await flow.execute('customer-1', 'merchant-1', 'producto inexistente');

    expect(response).toContain('No encontré');
  });

  it('should handle multiple products', async () => {
    const mockProducts = [
      {
        id: 'product-1',
        name: 'Camiseta Roja',
        variants: [{ id: 'v1', name: 'M', price: { toNumber: () => 25 }, stock: 10 }],
      },
      {
        id: 'product-2',
        name: 'Camiseta Azul',
        variants: [{ id: 'v2', name: 'L', price: { toNumber: () => 30 }, stock: 5 }],
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalogService.searchProducts.mockResolvedValue(mockProducts as any);

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('Encontré varias opciones');
    expect(response).toContain('Camiseta Roja');
  });

  it('should handle multiple variants', async () => {
    const mockProduct = {
      id: 'product-1',
      name: 'Camiseta',
      variants: [
        { id: 'v1', name: 'Talla M', price: { toNumber: () => 25 }, stock: 10, isActive: true },
        { id: 'v2', name: 'Talla L', price: { toNumber: () => 30 }, stock: 5, isActive: true },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalogService.searchProducts.mockResolvedValue([mockProduct as any]);

    const response = await flow.execute('customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('tiene varias opciones');
    expect(response).toContain('Talla M');
  });

  it('should extract quantity from message', async () => {
    const mockCart = { id: 'cart-1', items: [] };
    const mockProduct = {
      id: 'product-1',
      name: 'Camiseta',
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
    catalogService.searchProducts.mockResolvedValue([mockProduct as any]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.addItem.mockResolvedValue(mockCart as any);
    cartService.getCartSummary.mockResolvedValue({
      items: [],
      total: 75,
      itemCount: 3,
    });

    const response = await flow.execute(
      'customer-1',
      'merchant-1',
      'camiseta',
      'quiero 3 camisetas',
    );

    expect(cartService.addItem).toHaveBeenCalledWith('customer-1', 'merchant-1', 'variant-1', 3);
    expect(response).toContain('Agregado al carrito');
  });
});
