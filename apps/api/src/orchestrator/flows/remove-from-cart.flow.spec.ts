import { Test, TestingModule } from '@nestjs/testing';
import { RemoveFromCartFlow } from './remove-from-cart.flow';
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
 * RemoveFromCartFlow Unit Tests
 * AC-10: Test remove from cart conversational flow
 * PR-04: Cart CRUD conversational
 * PR-GAP-1 AC-03: Verifica que RemoveFromCartFlow usa PlaybookService.getMessage() sin hardcode
 */
describe('AC-10: RemoveFromCartFlow', () => {
  let flow: RemoveFromCartFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;

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
        {
          provide: PlaybookService,
          useValue: {
            getMessage: buildMockGetMessage(),
          },
        },
      ],
    }).compile();

    flow = module.get<RemoveFromCartFlow>(RemoveFromCartFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('removido');
    expect(cartService.removeItem).toHaveBeenCalled();
    // AC-03: getMessage is called for removeConfirm, no hardcode
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'removeConfirm',
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta');

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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('No encontré');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'itemNotInCart',
      expect.any(Object),
    );
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'camiseta');

    expect(response).toContain('removido');
    expect(response).toContain('$35');
  });
});
