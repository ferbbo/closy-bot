import { Test, TestingModule } from '@nestjs/testing';
import { SearchCatalogFlow } from './search-catalog.flow';
import { CatalogService } from '../../services/catalog.service';
import { ProductWithVariants } from '../../persistence/repositories/product.repository';
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

const mockMerchant: MerchantPlaybookData = { id: 'merchant-123', name: 'TestMerchant' };

/**
 * SearchCatalogFlow Unit Tests
 * PR-GAP-1 AC-04: Verifica que SearchCatalogFlow usa PlaybookService.getMessage() sin hardcode
 */
describe('AC-04: SearchCatalogFlow uses PlaybookService.getMessage() (PR-GAP-1)', () => {
  let flow: SearchCatalogFlow;
  let catalogService: jest.Mocked<CatalogService>;
  let playbookService: jest.Mocked<PlaybookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
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
            getExpecting: jest.fn(),
            clearExpecting: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    catalogService = module.get(CatalogService);
    playbookService = module.get(PlaybookService);
  });

  it('should be defined', () => {
    expect(flow).toBeDefined();
  });

  describe('handle()', () => {
    const merchantId = 'merchant-123';

    it('should return no results message when no products found', async () => {
      catalogService.searchProducts.mockResolvedValue([]);

      const result = await flow.handle(mockMerchant, merchantId, 'nonexistent product');

      expect(result).toContain('No encontré productos');
      expect(result).toContain('nonexistent product');
      // AC-04: getMessage called for searchNoResults, no hardcode
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'searchNoResults',
        expect.objectContaining({ query: 'nonexistent product' }),
      );
    });

    it('should format single product with stock', async () => {
      const products: ProductWithVariants[] = [
        {
          id: 'prod-1',
          merchantId,
          name: 'Zapatillas Running',
          description: 'Zapatillas deportivas cómodas',
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              name: 'Talla 42',
              sku: 'ZAP-RUN-42',
              price: 50000,
              stock: 10,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      catalogService.searchProducts.mockResolvedValue(products);

      const result = await flow.handle(mockMerchant, merchantId, 'zapatillas');

      expect(result).toContain('Resultados para "zapatillas"');
      expect(result).toContain('Zapatillas Running');
      expect(result).toContain('$50000.00');
      expect(result).toContain('Stock: 10 unidades');
      // AC-04: getMessage called for searchResultsHeader
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'searchResultsHeader',
        expect.any(Object),
      );
    });

    it('should format multiple products with price ranges', async () => {
      const products: ProductWithVariants[] = [
        {
          id: 'prod-1',
          merchantId,
          name: 'Camisa Azul',
          description: 'Camisa casual',
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              name: 'M',
              sku: 'CAM-AZ-M',
              price: 30000,
              stock: 5,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 'var-2',
              productId: 'prod-1',
              name: 'L',
              sku: 'CAM-AZ-L',
              price: 35000,
              stock: 3,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'prod-2',
          merchantId,
          name: 'Camisa Roja',
          description: 'Camisa elegante',
          variants: [
            {
              id: 'var-3',
              productId: 'prod-2',
              name: 'M',
              sku: 'CAM-RO-M',
              price: 40000,
              stock: 2,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      catalogService.searchProducts.mockResolvedValue(products);

      const result = await flow.handle(mockMerchant, merchantId, 'camisa');

      expect(result).toContain('Camisa Azul');
      expect(result).toContain('Camisa Roja');
      expect(result).toContain('$30000.00 - $35000.00'); // Price range for first product
      expect(result).toContain('$40000.00'); // Single price for second product
    });

    it('should skip products with zero stock in all variants', async () => {
      const products: ProductWithVariants[] = [
        {
          id: 'prod-1',
          merchantId,
          name: 'Product With Stock',
          description: 'Available product',
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              name: 'Variant 1',
              sku: 'PROD-1-V1',
              price: 20000,
              stock: 5,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'prod-2',
          merchantId,
          name: 'Product Without Stock',
          description: 'Out of stock product',
          variants: [
            {
              id: 'var-2',
              productId: 'prod-2',
              name: 'Variant 1',
              sku: 'PROD-2-V1',
              price: 30000,
              stock: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 'var-3',
              productId: 'prod-2',
              name: 'Variant 2',
              sku: 'PROD-2-V2',
              price: 35000,
              stock: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      catalogService.searchProducts.mockResolvedValue(products);

      const result = await flow.handle(mockMerchant, merchantId, 'product');

      // Should include product with stock
      expect(result).toContain('Product With Stock');
      // Should NOT include product without stock
      expect(result).not.toContain('Product Without Stock');
    });

    it('should return no results when all products have zero stock', async () => {
      const products: ProductWithVariants[] = [
        {
          id: 'prod-1',
          merchantId,
          name: 'Out of Stock Product',
          description: 'No stock',
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              name: 'Variant 1',
              sku: 'PROD-1-V1',
              price: 20000,
              stock: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      catalogService.searchProducts.mockResolvedValue(products);

      const result = await flow.handle(mockMerchant, merchantId, 'product');

      expect(result).toContain('No encontré productos');
      expect(result).not.toContain('Out of Stock Product');
    });

    it('should limit results to max 5 products as requested from catalog service', async () => {
      // Create 7 products
      const products: ProductWithVariants[] = Array.from({ length: 7 }, (_, i) => ({
        id: `prod-${i}`,
        merchantId,
        name: `Product ${i}`,
        description: `Description ${i}`,
        variants: [
          {
            id: `var-${i}`,
            productId: `prod-${i}`,
            name: 'Default',
            sku: `SKU-${i}`,
            price: 10000 + i * 1000,
            stock: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      catalogService.searchProducts.mockResolvedValue(products);

      await flow.handle(mockMerchant, merchantId, 'product');

      // Verify catalog service was called with limit 5
      expect(catalogService.searchProducts).toHaveBeenCalledWith(merchantId, 'product', 5);
    });

    it('should truncate long descriptions to 60 characters', async () => {
      const longDescription =
        'This is a very long product description that should be truncated to 60 characters maximum for WhatsApp readability';
      const products: ProductWithVariants[] = [
        {
          id: 'prod-1',
          merchantId,
          name: 'Product',
          description: longDescription,
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              name: 'Default',
              sku: 'PROD-1',
              price: 20000,
              stock: 5,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      catalogService.searchProducts.mockResolvedValue(products);

      const result = await flow.handle(mockMerchant, merchantId, 'product');

      expect(result).toContain('...');
      expect(result).toContain(longDescription.substring(0, 60));
      expect(result).not.toContain(longDescription);
    });
  });
});

// ---------------------------------------------------------------------------
// AC-05 (PR-04.0): SearchCatalogFlow sets expecting after search results
// REQ-06: save lastSearchResults + setExpecting select_product
// ---------------------------------------------------------------------------

describe('AC-05: SearchCatalogFlow - sets expecting after search (PR-04.0)', () => {
  let flow: SearchCatalogFlow;
  let catalogService: jest.Mocked<CatalogService>;
  let expectingService: jest.Mocked<ExpectingService>;

  const mockProduct: ProductWithVariants = {
    id: 'prod-1',
    merchantId: 'merch-1',
    name: 'Camiseta Azul',
    description: 'Camiseta casual',
    variants: [
      {
        id: 'var-1',
        productId: 'prod-1',
        name: 'M',
        sku: 'CAM-AZ-M',
        price: 30000,
        stock: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
        {
          provide: CatalogService,
          useValue: { searchProducts: jest.fn() },
        },
        {
          provide: PlaybookService,
          useValue: { getMessage: buildMockGetMessage() },
        },
        {
          provide: ExpectingService,
          useValue: {
            setExpecting: jest.fn().mockResolvedValue(undefined),
            getExpecting: jest.fn(),
            clearExpecting: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    catalogService = module.get(CatalogService);
    expectingService = module.get(ExpectingService);
  });

  it('AC-05: should call setExpecting with select_product after returning results', async () => {
    catalogService.searchProducts.mockResolvedValue([mockProduct]);

    await flow.handle(mockMerchant, 'merch-1', 'camiseta', 'conv-1');

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        flow: 'search_selection',
        type: 'select_product',
        data: expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              id: 'prod-1',
              name: 'Camiseta Azul',
              price: 30000,
              stock: 5,
            }),
          ]),
          page: 1,
          hasMore: false,
        }),
      }),
    );
  });

  it('AC-05: should NOT call setExpecting if no conversationId provided', async () => {
    catalogService.searchProducts.mockResolvedValue([mockProduct]);

    await flow.handle(mockMerchant, 'merch-1', 'camiseta');

    expect(expectingService.setExpecting).not.toHaveBeenCalled();
  });

  it('AC-05: should NOT call setExpecting if no products found', async () => {
    catalogService.searchProducts.mockResolvedValue([]);

    await flow.handle(mockMerchant, 'merch-1', 'nonexistent', 'conv-1');

    expect(expectingService.setExpecting).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-04.1 AC-01: empty sanitizedQuery triggers ask_search_query expecting
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-01: SearchCatalogFlow empty sanitizedQuery sets ask_search_query expecting', () => {
  let flow: SearchCatalogFlow;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
        { provide: CatalogService, useValue: { searchProducts: jest.fn() } },
        { provide: PlaybookService, useValue: { getMessage: buildMockGetMessage() } },
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

    flow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);
  });

  it.each(['buscar', 'busco', 'tienes', 'hay'])(
    'AC-01: "%s" (no product) → sets ask_search_query expecting and responds searchAskKeyword',
    async (input) => {
      const response = await flow.handle(mockMerchant, 'merch-1', input, 'conv-1');

      expect(expectingService.setExpecting).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          flow: 'search_selection',
          type: 'ask_search_query',
        }),
      );
      expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'searchAskKeyword');
      expect(response).toBeDefined();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-04.1 AC-02: non-empty sanitizedQuery triggers select_product expecting
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-02: SearchCatalogFlow non-empty sanitizedQuery sets select_product expecting', () => {
  let flow: SearchCatalogFlow;
  let catalogService: jest.Mocked<CatalogService>;
  let expectingService: jest.Mocked<ExpectingService>;

  const mockProduct: ProductWithVariants = {
    id: 'p1',
    merchantId: 'merch-1',
    name: 'Camiseta',
    description: 'desc',
    variants: [
      {
        id: 'v1',
        productId: 'p1',
        name: 'M',
        sku: 'C-M',
        price: 30000,
        stock: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
        { provide: CatalogService, useValue: { searchProducts: jest.fn() } },
        { provide: PlaybookService, useValue: { getMessage: buildMockGetMessage() } },
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

    flow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    catalogService = module.get(CatalogService);
    expectingService = module.get(ExpectingService);
  });

  it.each(['buscar camiseta', 'tienes vestidos?', 'necesito zapatos'])(
    'AC-02: "%s" → sets select_product expecting with data.products and page=1',
    async (input) => {
      catalogService.searchProducts.mockResolvedValue([mockProduct]);

      await flow.handle(mockMerchant, 'merch-1', input, 'conv-1');

      expect(expectingService.setExpecting).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          flow: 'search_selection',
          type: 'select_product',
          data: expect.objectContaining({
            products: expect.arrayContaining([expect.objectContaining({ id: 'p1' })]),
            page: 1,
          }),
        }),
      );
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-04.1 AC-03: pagination next page / no more pages
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-03: SearchCatalogFlow pagination next page / no more pages', () => {
  let flow: SearchCatalogFlow;
  let catalogService: jest.Mocked<CatalogService>;
  let expectingService: jest.Mocked<ExpectingService>;
  let playbookService: jest.Mocked<PlaybookService>;

  function makeProduct(id: string): ProductWithVariants {
    return {
      id,
      merchantId: 'merch-1',
      name: `Product ${id}`,
      description: '',
      variants: [
        {
          id: `v-${id}`,
          productId: id,
          name: 'M',
          sku: `SKU-${id}`,
          price: 10000,
          stock: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
        { provide: CatalogService, useValue: { searchProducts: jest.fn() } },
        { provide: PlaybookService, useValue: { getMessage: buildMockGetMessage() } },
        {
          provide: ExpectingService,
          useValue: {
            setExpecting: jest.fn().mockResolvedValue(undefined),
            getExpecting: jest.fn(),
            clearExpecting: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    flow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    catalogService = module.get(CatalogService);
    expectingService = module.get(ExpectingService);
    playbookService = module.get(PlaybookService);
  });

  it('AC-03: "siguiente" with hasMore=true advances to page 2', async () => {
    // Returns 11 results so page 2 exists
    catalogService.searchProducts.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => makeProduct(`p${i}`)),
    );

    (expectingService.getExpecting as jest.Mock).mockResolvedValue({
      flow: 'search_selection',
      type: 'select_product',
      data: { products: [], page: 1, hasMore: true, searchQuery: 'pantalones' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    await flow.handleNextPage(mockMerchant, 'merch-1', 'conv-1');

    expect(expectingService.setExpecting).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        data: expect.objectContaining({ page: 2 }),
      }),
    );
  });

  it('AC-03: "siguiente" with hasMore=false returns searchNoMorePages', async () => {
    (expectingService.getExpecting as jest.Mock).mockResolvedValue({
      flow: 'search_selection',
      type: 'select_product',
      data: { products: [], page: 1, hasMore: false, searchQuery: 'pantalones' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    await flow.handleNextPage(mockMerchant, 'merch-1', 'conv-1');

    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'searchNoMorePages');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-04.1 AC-11: ask_search_query state → any text treated as search query
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-11: SearchCatalogFlow handles any text from ask_search_query state as query', () => {
  let flow: SearchCatalogFlow;
  let catalogService: jest.Mocked<CatalogService>;
  let expectingService: jest.Mocked<ExpectingService>;

  const mockProduct: ProductWithVariants = {
    id: 'p1',
    merchantId: 'merch-1',
    name: 'Camiseta Roja',
    description: 'desc',
    variants: [
      {
        id: 'v1',
        productId: 'p1',
        name: 'M',
        sku: 'C-M',
        price: 30000,
        stock: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
        { provide: CatalogService, useValue: { searchProducts: jest.fn() } },
        { provide: PlaybookService, useValue: { getMessage: buildMockGetMessage() } },
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

    flow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    catalogService = module.get(CatalogService);
    expectingService = module.get(ExpectingService);
    catalogService.searchProducts.mockResolvedValue([mockProduct]);
  });

  it.each(['camiseta roja', 'jeans'])(
    'AC-11: "%s" received in ask_search_query state → search executed with that text',
    async (input) => {
      await flow.handleAskSearchQueryReply(mockMerchant, 'merch-1', input, 'conv-1');

      expect(catalogService.searchProducts).toHaveBeenCalledWith(
        'merch-1',
        input,
        expect.any(Number),
      );
      expect(expectingService.setExpecting).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ type: 'select_product' }),
      );
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-04.1 AC-12: "siguiente" context keyword only active under select_product
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-12: keyword siguiente only active in select_product context', () => {
  it('AC-12: SEARCH_PRODUCT keyword-configs contains "siguiente"', async () => {
    const { INTENT_KEYWORDS } = await import('../intent/keyword-configs');
    const searchKeywords = INTENT_KEYWORDS.SEARCH_PRODUCT;
    const siguienteEntry = searchKeywords.find((k) => k.phrase === 'siguiente');
    expect(siguienteEntry).toBeDefined();
  });
});
