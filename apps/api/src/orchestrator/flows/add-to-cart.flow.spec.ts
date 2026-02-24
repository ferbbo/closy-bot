import { Test, TestingModule } from '@nestjs/testing';
import { AddToCartFlow } from './add-to-cart.flow';
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
 * AddToCartFlow Unit Tests
 * AC-07: Test add-to-cart conversational flow
 * PR-04: Cart CRUD conversational
 * PR-GAP-1 AC-03: Verifica que AddToCartFlow usa PlaybookService.getMessage() sin hardcode
 */
describe('AC-07: AddToCartFlow', () => {
  let flow: AddToCartFlow;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;
  let playbookService: jest.Mocked<PlaybookService>;

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
        {
          provide: PlaybookService,
          useValue: {
            getMessage: buildMockGetMessage(),
          },
        },
      ],
    }).compile();

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
    playbookService = module.get(PlaybookService);
  });

  it('AC-07: should add item and return confirmation (getMessage called)', async () => {
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta roja');

    expect(response).toContain('Agregado al carrito');
    expect(response).toContain('Camiseta Roja');
    expect(cartService.addItem).toHaveBeenCalled();
    // AC-03: getMessage is called, no hardcode
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'addToCartConfirm',
      expect.any(Object),
    );
  });

  it('AC-03: should call getMessage(productNotFound) when no results', async () => {
    catalogService.searchProducts.mockResolvedValue([]);

    const response = await flow.execute(
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

  it('should handle multiple products calling getMessage(productMultipleOptions)', async () => {
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('Encontré varias opciones');
    expect(response).toContain('Camiseta Roja');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'productMultipleOptions',
      expect.any(Object),
    );
  });

  it('should handle multiple variants calling getMessage(variantMultipleOptions)', async () => {
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('tiene varias opciones');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'variantMultipleOptions',
      expect.any(Object),
    );
  });

  it('AC-03: should call getMessage(quantityInvalid) for out-of-range quantity', async () => {
    const response = await flow.execute(
      mockMerchant,
      'customer-1',
      'merchant-1',
      'producto',
      'quiero 200 productos',
    );

    expect(response).toContain('cantidad debe estar entre 1 y 99');
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'quantityInvalid');
  });
});
