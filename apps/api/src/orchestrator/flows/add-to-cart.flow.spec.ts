import { Test, TestingModule } from '@nestjs/testing';
import { AddToCartFlow } from './add-to-cart.flow';
import { CartService } from '../../services/cart.service';
import { CatalogService } from '../../services/catalog.service';
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

function buildTestModule(
  overrides: Partial<{
    cartService: object;
    catalogService: object;
    playbookService: object;
    expectingService: object;
  }> = {},
) {
  return Test.createTestingModule({
    providers: [
      AddToCartFlow,
      {
        provide: CartService,
        useValue: overrides.cartService ?? {
          addItem: jest.fn(),
          getCartSummary: jest.fn(),
        },
      },
      {
        provide: CatalogService,
        useValue: overrides.catalogService ?? {
          searchProducts: jest.fn(),
        },
      },
      {
        provide: PlaybookService,
        useValue: overrides.playbookService ?? {
          getMessage: buildMockGetMessage(),
        },
      },
      {
        provide: ExpectingService,
        useValue: overrides.expectingService ?? {
          getExpecting: jest.fn().mockResolvedValue(null),
          setExpecting: jest.fn().mockResolvedValue(undefined),
          clearExpecting: jest.fn().mockResolvedValue(undefined),
        },
      },
    ],
  }).compile();
}

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
    const module: TestingModule = await buildTestModule();

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

// ─────────────────────────────────────────────────────────────────────────────
// PR-04.1: Guided search expecting state tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-04: AddToCartFlow select product sets product_options expecting', () => {
  let flow: AddToCartFlow;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  const products = [
    { id: 'p1', name: 'Camiseta Azul', price: 30000, stock: 5 },
    { id: 'p2', name: 'Camiseta Roja', price: 35000, stock: 3 },
    { id: 'p3', name: 'Camiseta Verde', price: 25000, stock: 8 },
  ];

  beforeEach(async () => {
    const mockExpecting = jest.fn().mockResolvedValue({
      flow: 'search_selection',
      type: 'select_product',
      data: { products },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const mockPlaybook = { getMessage: buildMockGetMessage() };

    const module: TestingModule = await buildTestModule({
      expectingService: {
        getExpecting: mockExpecting,
        setExpecting: jest.fn().mockResolvedValue(undefined),
        clearExpecting: jest.fn().mockResolvedValue(undefined),
      },
      playbookService: mockPlaybook,
    });

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);
  });

  it('AC-04: numeric selection sets product_options expecting with selectedProduct', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '2');

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        flow: 'search_selection',
        type: 'product_options',
        data: expect.objectContaining({
          selectedProduct: expect.objectContaining({ id: 'p2', name: 'Camiseta Roja' }),
        }),
      }),
    );
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'searchActionMenu',
      expect.any(Object),
    );
  });

  it('AC-09: OOB selection returns invalidProductSelection without changing expecting', async () => {
    const response = await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '6');

    expect(expectingService.setExpecting).not.toHaveBeenCalled();
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'invalidProductSelection',
      expect.objectContaining({ count: 3 }),
    );
    expect(response).toBeDefined();
  });

  it('AC-09: non-numeric input returns invalidProductSelection without changing expecting', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', 'sí');

    expect(expectingService.setExpecting).not.toHaveBeenCalled();
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'invalidProductSelection',
      expect.any(Object),
    );
  });
});

describe('AC-05: AddToCartFlow adds to cart qty=1 and clears expecting', () => {
  let flow: AddToCartFlow;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  const selectedProduct = { id: 'p1', name: 'Camiseta Azul', price: 30000 };

  beforeEach(async () => {
    const mockExpecting = jest.fn().mockResolvedValue({
      flow: 'search_selection',
      type: 'product_options',
      data: { selectedProduct },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const module: TestingModule = await buildTestModule({
      expectingService: {
        getExpecting: mockExpecting,
        setExpecting: jest.fn().mockResolvedValue(undefined),
        clearExpecting: jest.fn().mockResolvedValue(undefined),
      },
    });

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);

    // Mock catalog returns the product
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalogService.searchProducts.mockResolvedValue([
      {
        id: 'p1',
        name: 'Camiseta Azul',
        variants: [{ id: 'v1', name: 'Talla M', price: 30000, stock: 5, isActive: true }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.addItem.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({ items: [], total: 30000, itemCount: 1 });
  });

  it('AC-05: option "1" in product_options adds to cart with qty=1 and clears expecting', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '1');

    expect(cartService.addItem).toHaveBeenCalledWith('cust-1', 'merch-1', 'v1', 1);
    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'addToCartConfirm',
      expect.any(Object),
    );
  });

  it('AC-08: option "3" in product_options calls clearExpecting and searchCancelled', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '3');

    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'searchCancelled');
  });
});

describe('AC-06: AddToCartFlow view details sets view_details expecting', () => {
  let flow: AddToCartFlow;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  const selectedProduct = { id: 'p1', name: 'Camiseta Azul', price: 30000 };

  beforeEach(async () => {
    const mockExpecting = jest.fn().mockResolvedValue({
      flow: 'search_selection',
      type: 'product_options',
      data: { selectedProduct },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const module: TestingModule = await buildTestModule({
      expectingService: {
        getExpecting: mockExpecting,
        setExpecting: jest.fn().mockResolvedValue(undefined),
        clearExpecting: jest.fn().mockResolvedValue(undefined),
      },
    });

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);
  });

  it('AC-06: option "2" in product_options sets view_details expecting and shows details', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '2');

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        flow: 'search_selection',
        type: 'view_details',
        data: expect.objectContaining({ selectedProduct }),
      }),
    );
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'searchViewDetails',
      expect.any(Object),
    );
  });
});

describe('AC-07: AddToCartFlow adds from view_details and clears expecting', () => {
  let flow: AddToCartFlow;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  const selectedProduct = { id: 'p1', name: 'Camiseta Azul', price: 30000 };

  beforeEach(async () => {
    const mockExpecting = jest.fn().mockResolvedValue({
      flow: 'search_selection',
      type: 'view_details',
      data: { selectedProduct },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const module: TestingModule = await buildTestModule({
      expectingService: {
        getExpecting: mockExpecting,
        setExpecting: jest.fn().mockResolvedValue(undefined),
        clearExpecting: jest.fn().mockResolvedValue(undefined),
      },
    });

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalogService.searchProducts.mockResolvedValue([
      {
        id: 'p1',
        name: 'Camiseta Azul',
        variants: [{ id: 'v1', name: 'Talla M', price: 30000, stock: 5, isActive: true }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cartService.addItem.mockResolvedValue({ id: 'cart-1' } as any);
    cartService.getCartSummary.mockResolvedValue({ items: [], total: 30000, itemCount: 1 });
  });

  it('AC-07: option "1" in view_details adds to cart and clears expecting', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '1');

    expect(cartService.addItem).toHaveBeenCalledWith('cust-1', 'merch-1', 'v1', 1);
    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(
      mockMerchant,
      'addToCartConfirm',
      expect.any(Object),
    );
  });

  it('AC-08: option "2" in view_details calls clearExpecting and searchCancelled', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '2');

    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'searchCancelled');
  });
});

describe('AC-10: AddToCartFlow expired expecting returns searchExpired', () => {
  let flow: AddToCartFlow;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  beforeEach(async () => {
    const module: TestingModule = await buildTestModule({
      expectingService: {
        // Expired: getExpecting returns null (TTL check is inside ExpectingService)
        getExpecting: jest.fn().mockResolvedValue(null),
        setExpecting: jest.fn().mockResolvedValue(undefined),
        clearExpecting: jest.fn().mockResolvedValue(undefined),
      },
    });

    flow = module.get<AddToCartFlow>(AddToCartFlow);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);
  });

  it('AC-10: expired expecting (getExpecting returns null) returns searchExpired message', async () => {
    await flow.handleExpecting(mockMerchant, 'cust-1', 'merch-1', 'conv-1', '1');

    expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'searchExpired');
  });
});

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
        {
          provide: ExpectingService,
          useValue: {
            setExpecting: jest.fn().mockResolvedValue(undefined),
            getExpecting: jest.fn().mockResolvedValue(null),
            clearExpecting: jest.fn().mockResolvedValue(undefined),
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
