import { Test, TestingModule } from '@nestjs/testing';
import { CartFlow } from './cart.flow';
import { CartService } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { PlaybookMessages } from '../../domain/entities/playbook-config.interface';
import { GenericPlaybookDefaults } from '../../domain/entities/playbook-defaults/generic.config';

function buildMockGetMessage() {
  return jest
    .fn()
    .mockImplementation(
      (
        merchant: MerchantPlaybookData,
        key: keyof PlaybookMessages,
        placeholders?: Record<string, string | number>,
      ) => {
        let template: string = GenericPlaybookDefaults.messages[key] ?? String(key);
        if (placeholders) {
          for (const [k, v] of Object.entries(placeholders)) {
            template = template.replace(`{${k}}`, String(v));
          }
        }
        return template;
      },
    );
}

const mockMerchant: MerchantPlaybookData = { id: 'merchant-1', name: 'TestMerchant' };

/**
 * CartFlow Unit Tests
 * PR-04: Tests for conversational cart operations
 * PR-GAP-1 AC-03: Verifica que CartFlow usa PlaybookService.getMessage() sin hardcode
 */
describe('AC-03: CartFlow uses PlaybookService.getMessage() (PR-GAP-1)', () => {
  let flow: CartFlow;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;
  let playbookService: jest.Mocked<PlaybookService>;

  beforeEach(async () => {
    const mockGetMessage = buildMockGetMessage();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartFlow,
        {
          provide: CartService,
          useValue: {
            createOrGetActiveCart: jest.fn(),
            addItem: jest.fn(),
            getCartSummary: jest.fn(),
            updateQuantity: jest.fn(),
            removeItem: jest.fn(),
          },
        },
        {
          provide: CatalogService,
          useValue: {
            searchProducts: jest.fn(),
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getMessage: mockGetMessage,
          },
        },
      ],
    }).compile();

    flow = module.get<CartFlow>(CartFlow);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
    playbookService = module.get(PlaybookService);
  });

  describe('AC-07: handleAddToCart', () => {
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

      const response = await flow.handleAddToCart(
        mockMerchant,
        'customer-1',
        'merchant-1',
        'camiseta roja',
      );

      expect(response).toContain('Agregado al carrito');
      expect(response).toContain('Camiseta Roja');
      expect(cartService.addItem).toHaveBeenCalled();
      // AC-03: getMessage is called for addToCartConfirm (no hardcode)
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'addToCartConfirm',
        expect.any(Object),
      );
    });

    it('AC-03: should call getMessage(productNotFound) when no results (no hardcode)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      catalogService.searchProducts.mockResolvedValue([]);

      const response = await flow.handleAddToCart(
        mockMerchant,
        'customer-1',
        'merchant-1',
        'producto inexistente',
      );

      expect(response).toContain('No encontré');
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'productNotFound',
        expect.objectContaining({ query: 'producto inexistente' }),
      );
    });
  });

  describe('AC-08: handleShowCart', () => {
    it('should show cart summary using getMessage', async () => {
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

      const response = await flow.handleShowCart(mockMerchant, 'customer-1', 'merchant-1');

      expect(response).toContain('Tu carrito');
      expect(response).toContain('Camiseta');
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'cartSummaryHeader',
        expect.any(Object),
      );
    });

    it('AC-03: should call getMessage(cartEmpty) when cart is empty (no hardcode)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      cartService.getCartSummary.mockResolvedValue({ items: [], total: 0, itemCount: 0 });

      const response = await flow.handleShowCart(mockMerchant, 'customer-1', 'merchant-1');

      expect(response).toContain('carrito está vacío');
      expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'cartEmpty');
    });
  });

  describe('AC-10: handleRemoveItem', () => {
    it('should remove item via conversation using getMessage', async () => {
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
        .mockResolvedValueOnce({ items: [], total: 0, itemCount: 0 });

      const response = await flow.handleRemoveItem(
        mockMerchant,
        'customer-1',
        'merchant-1',
        'camiseta',
      );

      expect(response).toContain('removido');
      expect(cartService.removeItem).toHaveBeenCalled();
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'removeConfirm',
        expect.any(Object),
      );
    });
  });

  describe('AC-09: handleUpdateQuantity', () => {
    it('should update item quantity using getMessage', async () => {
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

      const response = await flow.handleUpdateQuantity(
        mockMerchant,
        'customer-1',
        'merchant-1',
        'camiseta',
        3,
      );

      expect(response).toContain('actualizada');
      expect(response).toContain('3 unidades');
      expect(cartService.updateQuantity).toHaveBeenCalledWith('cart-1', 'item-1', 3);
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'updateConfirm',
        expect.any(Object),
      );
    });

    it('AC-03: should call getMessage(quantityInvalid) for out-of-range quantity (no hardcode)', async () => {
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

      const response = await flow.handleUpdateQuantity(
        mockMerchant,
        'customer-1',
        'merchant-1',
        'camiseta',
        150,
      );

      expect(response).toContain('cantidad debe estar entre 1 y 99');
      expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'quantityInvalid');
      expect(cartService.updateQuantity).not.toHaveBeenCalled();
    });
  });
});
