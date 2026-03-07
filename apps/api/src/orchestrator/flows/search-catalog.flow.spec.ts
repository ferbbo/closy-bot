import { Test, TestingModule } from '@nestjs/testing';
import { SearchCatalogFlow } from './search-catalog.flow';
import { CatalogService } from '../../services/catalog.service';
import { ProductWithVariants } from '../../persistence/repositories/product.repository';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { PlaybookMessages } from '../../domain/entities/playbook-config.interface';
import { GenericPlaybookDefaults } from '../../domain/entities/playbook-defaults/generic.config';
import { QueryParserService } from '../nlu/query-parser.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

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
          provide: QueryParserService,
          useValue: { parse: jest.fn() },
        },
        {
          provide: FeatureFlagsService,
          useValue: { isSearchNluEnabled: false }, // NLU OFF by default
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

/**
 * AC-06: SearchCatalogFlow invokes QueryParserService only if feature flag is active
 * AC-11: With FEATURES_MODE=mvp, NLU NOT invoked — pipeline works like before
 */
describe('AC-06 / AC-11: NLU feature flag gating in SearchCatalogFlow', () => {
  const merchantId = 'merchant-nlu';
  const mockMerchantNlu: MerchantPlaybookData = { id: merchantId, name: 'NLU Merchant' };

  function buildModule(isSearchNluEnabled: boolean) {
    const mockProducts: ProductWithVariants[] = [
      {
        id: 'prod-nlu-1',
        merchantId,
        name: 'Jeans Azul',
        description: 'Jeans de mezclilla',
        variants: [
          {
            id: 'var-nlu-1',
            productId: 'prod-nlu-1',
            name: 'Talla 32',
            sku: 'JAN-AZ-32',
            price: 90000,
            stock: 5,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        isActive: true,
        categoryId: null,
        searchText: null,
        imageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const catalogServiceMock = { searchProducts: jest.fn().mockResolvedValue(mockProducts) };
    const queryParserMock = {
      parse: jest.fn().mockReturnValue({ cleanText: 'jeans', filters: { priceMin: 85000 } }),
    };
    const flagsMock = { isSearchNluEnabled };
    const playbookMock = { getMessage: buildMockGetMessage() };

    return Test.createTestingModule({
      providers: [
        SearchCatalogFlow,
        { provide: CatalogService, useValue: catalogServiceMock },
        { provide: PlaybookService, useValue: playbookMock },
        { provide: QueryParserService, useValue: queryParserMock },
        { provide: FeatureFlagsService, useValue: flagsMock },
      ],
    })
      .compile()
      .then((m) => ({
        flow: m.get<SearchCatalogFlow>(SearchCatalogFlow),
        catalogService: m.get(CatalogService) as jest.Mocked<CatalogService>,
        queryParser: m.get(QueryParserService) as jest.Mocked<QueryParserService>,
      }));
  }

  it('AC-06: con flag ON → invoca QueryParserService.parse() y pasa filters a CatalogService', async () => {
    const { flow, catalogService, queryParser } = await buildModule(true);

    await flow.handle(mockMerchantNlu, merchantId, 'jeans desde 85000');

    expect(queryParser.parse).toHaveBeenCalledWith('jeans desde 85000');
    expect(catalogService.searchProducts).toHaveBeenCalledWith(merchantId, 'jeans', 5, {
      priceMin: 85000,
    });
  });

  it('AC-11: con flag OFF (FEATURES_MODE=mvp) → NO invoca QueryParserService', async () => {
    const { flow, catalogService, queryParser } = await buildModule(false);

    await flow.handle(mockMerchantNlu, merchantId, 'jeans desde 85000');

    // NLU NOT called
    expect(queryParser.parse).not.toHaveBeenCalled();
    // CatalogService called with full query (no filters)
    expect(catalogService.searchProducts).toHaveBeenCalledWith(merchantId, 'jeans desde 85000', 5);
  });
});
