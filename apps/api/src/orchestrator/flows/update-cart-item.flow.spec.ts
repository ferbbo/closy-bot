import { Test, TestingModule } from '@nestjs/testing';
import { UpdateCartItemFlow } from './update-cart-item.flow';
import { CartService } from '../../services/cart.service';
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
 * UpdateCartItemFlow Unit Tests
 * AC-09: Test update cart item conversational flow
 * PR-04: Cart CRUD conversational
 * PR-GAP-1 AC-03: Verifica que UpdateCartItemFlow usa PlaybookService.getMessage() sin hardcode
 */
describe('AC-09: UpdateCartItemFlow', () => {
  let flow: UpdateCartItemFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;

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
        {
          provide: PlaybookService,
          useValue: {
            getMessage: buildMockGetMessage(),
          },
        },
      ],
    }).compile();

    flow = module.get<UpdateCartItemFlow>(UpdateCartItemFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta', 3);

    expect(response).toContain('Cantidad actualizada');
    expect(response).toContain('3 unidades');
    expect(cartService.updateQuantity).toHaveBeenCalled();
    // AC-03: getMessage called for updateConfirm, no hardcode
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'updateConfirm',
      expect.any(Object),
    );
  });

  it('AC-03: should call getMessage(cartEmptyNoAction) for empty cart (no hardcode)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({
      items: [],
      total: 0,
      itemCount: 0,
    });

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta', 3);

    expect(response).toContain('carrito está vacío');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartEmptyNoAction',
      expect.any(Object),
    );
  });

  it('AC-03: should call getMessage(itemNotInCart) when item not found (no hardcode)', async () => {
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta', 3);

    expect(response).toContain('No encontré');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'itemNotInCart',
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta', 100);

    expect(response).toContain('La cantidad debe estar entre 1 y 99');
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'quantityInvalid');
    expect(cartService.updateQuantity).not.toHaveBeenCalled();
  });
});
