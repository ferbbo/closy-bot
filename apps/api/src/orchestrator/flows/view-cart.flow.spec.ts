import { Test, TestingModule } from '@nestjs/testing';
import { ViewCartFlow } from './view-cart.flow';
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
 * ViewCartFlow Unit Tests
 * AC-08: Test view cart conversational flow
 * PR-04: Cart CRUD conversational
 * PR-GAP-1 AC-03: Verifica que ViewCartFlow usa PlaybookService.getMessage() sin hardcode
 */
describe('AC-08: ViewCartFlow', () => {
  let flow: ViewCartFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;

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
          useValue: {
            getMessage: buildMockGetMessage(),
          },
        },
      ],
    }).compile();

    flow = module.get<ViewCartFlow>(ViewCartFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
  });

  it('AC-08: should format cart summary (getMessage called)', async () => {
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1');

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
    cartService.getCartSummary.mockResolvedValue({
      items: [],
      total: 0,
      itemCount: 0,
    });

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1');

    expect(response).toContain('carrito está vacío');
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'cartEmpty');
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

    const response = await flow.execute(mockMerchant, 'customer-1', 'merchant-1');

    expect(response).toContain('Camiseta');
    expect(response).toContain('Pantalón');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartSummaryFooter',
      expect.any(Object),
    );
  });
});
