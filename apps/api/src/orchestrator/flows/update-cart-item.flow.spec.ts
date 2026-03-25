import { Test } from '@nestjs/testing';
import { UpdateCartItemFlow } from './update-cart-item.flow';
import { CartService } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';
import { PlaybookMessages } from '../../domain/entities/playbook-config.interface';
import { GenericPlaybookDefaults } from '../../domain/entities/playbook-defaults/generic.config';
import type { ExpectingState } from '../types/expecting.types';

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

function makeSelectQtyExpecting(extra: Record<string, unknown> = {}): ExpectingState {
  return {
    flow: 'cart_management',
    type: 'select_quantity',
    data: {
      selectedProduct: { id: 'item-1', name: 'Camiseta' },
      maxStock: 10,
      ...extra,
    },
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
}

function makeModule() {
  return Test.createTestingModule({
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
        useValue: { getMessage: buildMockGetMessage() },
      },
      {
        provide: ExpectingService,
        useValue: { setExpecting: jest.fn(), clearExpecting: jest.fn() },
      },
    ],
  }).compile();
}

describe('AC-07: UpdateCartItemFlow — handleAskQuantity', () => {
  let flow: UpdateCartItemFlow;
  let playbookService: jest.Mocked<PlaybookService>;
  let expectingService: jest.Mocked<ExpectingService>;

  beforeEach(async () => {
    const module = await makeModule();
    flow = module.get(UpdateCartItemFlow);
    playbookService = module.get(PlaybookService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-07: shows ask-quantity prompt and sets select_quantity expecting', async () => {
    const response = await flow.handleAskQuantity(
      mockMerchant,
      'conv-1',
      { id: 'item-1', name: 'Camiseta' },
      2,
      10,
    );

    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartModifyAskQuantity',
      expect.objectContaining({
        productName: 'Camiseta',
        quantity: 2,
        stock: 10,
      }),
    );
    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        flow: 'cart_management',
        type: 'select_quantity',
        data: expect.objectContaining({
          selectedProduct: expect.objectContaining({ id: 'item-1', name: 'Camiseta' }),
          maxStock: 10,
        }),
      }),
    );
    expect(response).toBeTruthy();
  });
});

describe('AC-09: UpdateCartItemFlow — handleSelectQuantity', () => {
  let flow: UpdateCartItemFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;
  let expectingService: jest.Mocked<ExpectingService>;

  beforeEach(async () => {
    const module = await makeModule();
    flow = module.get(UpdateCartItemFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-09: valid qty → updateQuantity called, clearExpecting called, cart shown', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.updateQuantity.mockResolvedValue({});
    cartService.getCartSummary.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          productName: 'Camiseta',
          variantName: 'M',
          quantity: 3,
          priceSnapshot: 25,
          subtotal: 75,
        },
      ],
      total: 75,
      itemCount: 3,
    });

    const expecting = makeSelectQtyExpecting();
    const response = await flow.handleSelectQuantity(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      '3',
      expecting,
    );

    expect(cartService.updateQuantity).toHaveBeenCalledWith('cart-1', 'item-1', 3);
    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartModifySuccess',
      expect.objectContaining({ productName: 'Camiseta', newQuantity: 3 }),
    );
    expect(response).toContain('Camiseta');
  });

  it('AC-11: qty > stock → ask quantity message, no update', async () => {
    const expecting = makeSelectQtyExpecting({ maxStock: 5 });
    await flow.handleSelectQuantity(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '15', expecting);

    // parseNumericSelection returns null for 15 > maxStock=5 → cartModifyAskQuantity
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartModifyAskQuantity',
      expect.any(Object),
    );
    expect(cartService.updateQuantity).not.toHaveBeenCalled();
  });

  it('AC-11: non-numeric input → ask quantity message, no update', async () => {
    const expecting = makeSelectQtyExpecting();
    await flow.handleSelectQuantity(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      'mucho',
      expecting,
    );

    expect(cartService.updateQuantity).not.toHaveBeenCalled();
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartModifyAskQuantity',
      expect.any(Object),
    );
  });
});
