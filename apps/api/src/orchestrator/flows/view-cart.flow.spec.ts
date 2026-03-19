import { Test, TestingModule } from '@nestjs/testing';
import { ViewCartFlow } from './view-cart.flow';
import { CartService } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';
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

describe('ViewCartFlow', () => {
  let flow: ViewCartFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;
  let expectingService: jest.Mocked<ExpectingService>;

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
        {
          provide: PlaybookService,
          useValue: { getMessage: buildMockGetMessage() },
        },
        {
          provide: ExpectingService,
          useValue: { setExpecting: jest.fn(), clearExpecting: jest.fn() },
        },
      ],
    }).compile();

    flow = module.get(ViewCartFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-12: should return cartEmpty message when cart is empty', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.getCartSummary.mockResolvedValue({ items: [], total: 0, itemCount: 0 });

    await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'conv-1');

    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'cartEmpty');
    expect(expectingService.setExpecting).not.toHaveBeenCalled();
  });

  it('AC-12: empty cart does NOT set expecting', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.getCartSummary.mockResolvedValue({ items: [], total: 0, itemCount: 0 });

    await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'conv-1');

    expect(expectingService.setExpecting).not.toHaveBeenCalled();
  });

  it('AC-03: should show numbered list with cartListWithActions message', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.getCartSummary.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          productName: 'Camiseta',
          variantName: 'M',
          quantity: 2,
          priceSnapshot: 25,
          subtotal: 50,
        },
        {
          id: 'item-2',
          productName: 'Pantalón',
          variantName: 'L',
          quantity: 1,
          priceSnapshot: 35,
          subtotal: 35,
        },
      ],
      total: 85,
      itemCount: 3,
    });

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'conv-1');

    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartListWithActions',
      expect.any(Object),
    );
    expect(response).toBeTruthy();
  });

  it('AC-04: should call setExpecting with cart_management/select_action', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.getCartSummary.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          productName: 'Camiseta',
          variantName: 'M',
          quantity: 1,
          priceSnapshot: 25,
          subtotal: 25,
        },
      ],
      total: 25,
      itemCount: 1,
    });

    await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'conv-1');

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        flow: 'cart_management',
        type: 'select_action',
        data: expect.objectContaining({
          cartItems: [{ id: 'item-1', name: 'Camiseta', qty: 1 }],
        }),
      }),
    );
  });

  it('should handle errors gracefully and return genericError', async () => {
    cartService.createOrGetActiveCart.mockRejectedValue(new Error('DB error'));

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1', 'conv-1');

    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'genericError',
      expect.any(Object),
    );
    expect(response).toBeTruthy();
  });
});
