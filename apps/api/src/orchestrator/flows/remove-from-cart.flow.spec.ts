import { Test } from '@nestjs/testing';
import { RemoveFromCartFlow } from './remove-from-cart.flow';
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

const mockCartItems = [
  { id: 'item-1', name: 'Camiseta', qty: 2 },
  { id: 'item-2', name: 'Pantalón', qty: 1 },
];

function makeExpectingState(type: string, extra: Record<string, unknown> = {}): ExpectingState {
  return {
    flow: 'cart_management',
    type: type as 'select_action' | 'confirm_action' | 'select_quantity',
    data: { cartItems: mockCartItems, ...extra },
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
}

function makeModule() {
  return Test.createTestingModule({
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
        useValue: { getMessage: buildMockGetMessage() },
      },
      {
        provide: ExpectingService,
        useValue: { setExpecting: jest.fn(), clearExpecting: jest.fn() },
      },
    ],
  }).compile();
}

describe('AC-05: RemoveFromCartFlow — handleSelectAction', () => {
  let flow: RemoveFromCartFlow;
  let playbookService: jest.Mocked<PlaybookService>;
  let expectingService: jest.Mocked<ExpectingService>;

  beforeEach(async () => {
    const module = await makeModule();
    flow = module.get(RemoveFromCartFlow);
    playbookService = module.get(PlaybookService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-05: "eliminar 2" → confirm action menu for Pantalón', async () => {
    const expecting = makeExpectingState('select_action');
    await flow.handleSelectAction(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      'eliminar 2',
      expecting,
    );

    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartActionConfirmPrompt',
      expect.objectContaining({ productName: 'Pantalón' }),
    );
    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        flow: 'cart_management',
        type: 'confirm_action',
        data: expect.objectContaining({ pendingAction: 'remove', selectedItemIndex: 2 }),
      }),
    );
  });

  it('AC-05: "modificar 1" → confirm action menu with modify pending', async () => {
    const expecting = makeExpectingState('select_action');
    await flow.handleSelectAction(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      'modificar 1',
      expecting,
    );

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        data: expect.objectContaining({ pendingAction: 'modify', selectedItemIndex: 1 }),
      }),
    );
  });

  it('AC-05: bare number "1" → confirm action with item 1', async () => {
    const expecting = makeExpectingState('select_action');
    await flow.handleSelectAction(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '1', expecting);

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        data: expect.objectContaining({ selectedItemIndex: 1 }),
      }),
    );
  });

  it('AC-10: index out of range → cartItemNotFound, no state change', async () => {
    const expecting = makeExpectingState('select_action');
    await flow.handleSelectAction(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      'eliminar 99',
      expecting,
    );

    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'cartItemNotFound');
    expect(expectingService.setExpecting).not.toHaveBeenCalled();
  });
});

describe('AC-06: RemoveFromCartFlow — handleConfirmRemove', () => {
  let flow: RemoveFromCartFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;
  let expectingService: jest.Mocked<ExpectingService>;

  beforeEach(async () => {
    const module = await makeModule();
    flow = module.get(RemoveFromCartFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-06: removes item, calls clearExpecting, shows updated cart', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.removeItem.mockResolvedValue({});
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
      ],
      total: 50,
      itemCount: 2,
    });

    const response = await flow.handleConfirmRemove(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      'item-2',
      'Pantalón',
    );

    expect(cartService.removeItem).toHaveBeenCalledWith('cart-1', 'item-2');
    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'cartRemoveSuccess',
      expect.objectContaining({ productName: 'Pantalón' }),
    );
    expect(response).toBeTruthy();
  });

  it('AC-06: empty cart after removal → shows cartEmpty message', async () => {
    cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' });
    cartService.removeItem.mockResolvedValue({});
    cartService.getCartSummary.mockResolvedValue({ items: [], total: 0, itemCount: 0 });

    const response = await flow.handleConfirmRemove(
      mockMerchant,
      'cust-1',
      'merch-1',
      'conv-1',
      'item-1',
      'Camiseta',
    );

    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'cartEmpty');
    expect(response).toContain('Camiseta');
  });
});

describe('AC-08: RemoveFromCartFlow — handleCancel', () => {
  let flow: RemoveFromCartFlow;
  let cartService: jest.Mocked<CartService>;
  let playbookService: jest.Mocked<PlaybookService>;
  let expectingService: jest.Mocked<ExpectingService>;

  beforeEach(async () => {
    const module = await makeModule();
    flow = module.get(RemoveFromCartFlow);
    cartService = module.get(CartService);
    playbookService = module.get(PlaybookService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-08: cancel clears expecting and returns cartActionCancelled', async () => {
    await flow.handleCancel(mockMerchant, 'conv-1');

    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(cartService.removeItem).not.toHaveBeenCalled();
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'cartActionCancelled');
  });
});
