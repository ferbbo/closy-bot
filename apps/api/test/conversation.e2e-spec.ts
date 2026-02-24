/**
 * AC-07: Conversation e2e integration tests (PR-GAP-1)
 * Tests that custom playbook messages flow through correctly:
 * - Custom cartEmpty message is used when cart is empty
 * - Custom searchNoResults message is used when no products found
 * - botPersonality.style is resolved and accessible via PlaybookService
 * - signatureEmoji is stored and retrievable
 *
 * Note: These are module-level integration tests using NestJS TestingModule with
 * controlled mocks for DB layer. Full HTTP e2e tests require a running database.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlaybookService, MerchantPlaybookData } from '../src/services/playbook.service';
import { ViewCartFlow } from '../src/orchestrator/flows/view-cart.flow';
import { SearchCatalogFlow } from '../src/orchestrator/flows/search-catalog.flow';
import { CartService } from '../src/services/cart.service';
import { CatalogService } from '../src/services/catalog.service';

describe('AC-07: Custom playbook messages flow end-to-end (PR-GAP-1)', () => {
  let viewCartFlow: ViewCartFlow;
  let searchCatalogFlow: SearchCatalogFlow;
  let playbookService: PlaybookService;
  let cartService: jest.Mocked<CartService>;
  let catalogService: jest.Mocked<CatalogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaybookService,
        ViewCartFlow,
        SearchCatalogFlow,
        {
          provide: CartService,
          useValue: {
            createOrGetActiveCart: jest.fn(),
            getCartSummary: jest.fn(),
          },
        },
        {
          provide: CatalogService,
          useValue: {
            searchProducts: jest.fn(),
          },
        },
      ],
    }).compile();

    viewCartFlow = module.get<ViewCartFlow>(ViewCartFlow);
    searchCatalogFlow = module.get<SearchCatalogFlow>(SearchCatalogFlow);
    playbookService = module.get<PlaybookService>(PlaybookService);
    cartService = module.get(CartService);
    catalogService = module.get(CatalogService);
  });

  describe('AC-07: Custom cartEmpty message is used for empty cart', () => {
    it('should use custom cartEmpty when merchant has custom playbook', async () => {
      const merchantWithCustom: MerchantPlaybookData = {
        id: 'merchant-custom',
        name: 'Custom Store',
        industry: null,
        playbookConfig: {
          messages: {
            cartEmpty: 'Tu carrito personalizado está vacío. ¡Empieza a comprar!',
          },
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      cartService.getCartSummary.mockResolvedValue({ items: [], total: 0, itemCount: 0 });

      const response = await viewCartFlow.execute(
        merchantWithCustom,
        'customer-1',
        'merchant-custom',
      );

      // AC-07: Custom cartEmpty is used, not default
      expect(response).toBe('Tu carrito personalizado está vacío. ¡Empieza a comprar!');
    });

    it('should use GenericPlaybookDefaults cartEmpty when no custom config', async () => {
      const genericMerchant: MerchantPlaybookData = {
        id: 'merchant-generic',
        name: 'Generic Store',
        industry: null,
        playbookConfig: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cartService.createOrGetActiveCart.mockResolvedValue({ id: 'cart-1' } as any);
      cartService.getCartSummary.mockResolvedValue({ items: [], total: 0, itemCount: 0 });

      const response = await viewCartFlow.execute(
        genericMerchant,
        'customer-1',
        'merchant-generic',
      );

      // Should contain default cartEmpty text
      expect(response).toContain('carrito');
      expect(typeof response).toBe('string');
    });
  });

  describe('AC-07: Custom searchNoResults message is used', () => {
    it('should use custom searchNoResults when merchant has custom playbook', async () => {
      const merchantWithCustom: MerchantPlaybookData = {
        id: 'merchant-custom-search',
        name: 'Custom Search Store',
        industry: null,
        playbookConfig: {
          messages: {
            searchNoResults: 'No encontramos {query} en nuestro catálogo personalizado.',
          },
        },
      };

      catalogService.searchProducts.mockResolvedValue([]);

      const response = await searchCatalogFlow.handle(
        merchantWithCustom,
        'merchant-custom-search',
        'zapatillas',
      );

      // AC-07: Custom searchNoResults is used with placeholder interpolation
      expect(response).toBe('No encontramos zapatillas en nuestro catálogo personalizado.');
    });
  });

  describe('AC-07: botPersonality is resolved and stored in PlaybookConfig', () => {
    it('should resolve botPersonality.style from merchant playbookConfig', () => {
      const merchantWithPersonality: MerchantPlaybookData = {
        id: 'merchant-minimal',
        name: 'Minimal Store',
        industry: null,
        playbookConfig: {
          botPersonality: {
            style: 'minimal',
            emojiUsage: 'none',
          },
        },
      };

      const playbook = playbookService.getPlaybookForMerchant(merchantWithPersonality);

      // AC-07: botPersonality.style is resolved
      expect(playbook.botPersonality?.style).toBe('minimal');
      expect(playbook.botPersonality?.emojiUsage).toBe('none');
    });

    it('should include signatureEmoji in botPersonality', () => {
      const merchantWithSignature: MerchantPlaybookData = {
        id: 'merchant-signature',
        name: 'Signature Store',
        industry: null,
        playbookConfig: {
          botPersonality: {
            style: 'enthusiastic',
            emojiUsage: 'frequent',
            signatureEmoji: '🔥',
          },
        },
      };

      const playbook = playbookService.getPlaybookForMerchant(merchantWithSignature);

      // AC-07: signatureEmoji is stored and retrievable
      expect(playbook.botPersonality?.signatureEmoji).toBe('🔥');
    });

    it('should use industry preset botPersonality when no custom override', () => {
      const ropaMerchant: MerchantPlaybookData = {
        id: 'merchant-ropa',
        name: 'Fashion Store',
        industry: 'ropa',
        playbookConfig: null,
      };

      const playbook = playbookService.getPlaybookForMerchant(ropaMerchant);

      // Ropa preset has enthusiastic style
      expect(playbook.botPersonality?.style).toBe('enthusiastic');
      expect(playbook.botPersonality?.signatureEmoji).toBe('👗');
    });
  });
});
