/**
 * AC-05, AC-07, AC-08: FaqFlow e2e integration tests (PR-GAP-2)
 *
 * Tests:
 * - AC-05: Orchestrator route QUERY_FAQ → FaqFlow → responds with FAQ answer (no LLM)
 * - AC-07: Client asks configured FAQ → receives correct response without handoff
 * - AC-08: Client asks non-covered question → fallback to generic (no crash)
 *
 * Uses NestJS TestingModule with mocked DB/LLM services.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FaqFlow } from '../src/orchestrator/flows/faq.flow';
import { PlaybookService, MerchantPlaybookData } from '../src/services/playbook.service';
import type { Faq } from '../src/domain/entities/playbook-config.interface';
import { RopaPlaybookDefaults } from '../src/domain/entities/playbook-defaults/ropa.config';

describe('AC-05, AC-07, AC-08: FaqFlow e2e — FAQ resolution end-to-end (PR-GAP-2)', () => {
  let faqFlow: FaqFlow;
  let playbookService: PlaybookService;

  const buildModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [FaqFlow, PlaybookService],
    }).compile();

    faqFlow = module.get<FaqFlow>(FaqFlow);
    playbookService = module.get<PlaybookService>(PlaybookService);
  };

  beforeEach(async () => {
    await buildModule();
  });

  // ─── AC-05: QUERY_FAQ resolves to FAQ answer ──────────────────────────────

  describe('AC-05: FaqFlow resolves FAQ from industry preset', () => {
    it('AC-05: Ropa preset — "¿Cuánto demora el envío?" returns shipping FAQ', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-ropa',
        name: 'Tienda Ropa',
        industry: 'ropa',
      };
      const result = faqFlow.handle(merchant, '¿Cuánto demora el envío?');
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
      expect(result!.length).toBeGreaterThan(0);
      // Should return the shipping FAQ answer
      expect(result).toContain('días');
    });

    it('AC-05: Generic preset — "¿Cuánto demora el envío?" returns shipping FAQ', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-generic',
        name: 'Tienda',
      };
      const result = faqFlow.handle(merchant, '¿Cuánto demora el envío?');
      expect(result).not.toBeNull();
      expect(result).toContain('días');
    });

    it('AC-05: Minimarket preset — "¿cuál es el horario?" returns hours FAQ', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-mini',
        name: 'Minimarket',
        industry: 'minimarket',
      };
      const result = faqFlow.handle(merchant, '¿cuál es el horario de atención?');
      expect(result).not.toBeNull();
      // Should return the hours FAQ answer
      expect(result).toContain('pm');
    });
  });

  // ─── AC-07: Merchant custom FAQ configured → correct answer ──────────────

  describe('AC-07: Merchant with custom FAQ configured — receives correct answer', () => {
    it('AC-07: Custom FAQ overrides industry defaults when merchant configures faqs', () => {
      const customFaqs: Faq[] = [
        {
          question: '¿Envían a provincias?',
          keywords: ['provincia', 'envio', 'region'],
          answer: 'Sí enviamos a todo el país en 5-7 días 🚚',
        },
      ];

      const merchantWithCustomFaq: MerchantPlaybookData = {
        id: 'merchant-custom',
        name: 'Custom Store',
        industry: 'ropa',
        playbookConfig: { faqs: customFaqs } as unknown as Record<string, unknown>,
      };

      const result = faqFlow.handle(merchantWithCustomFaq, '¿Tienen envío a provincia?');
      expect(result).not.toBeNull();
      expect(result).toBe('Sí enviamos a todo el país en 5-7 días 🚚');
    });

    it('AC-07: FaqFlow does NOT invent answers — only returns configured FAQ answer', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-1',
        name: 'Store',
        industry: 'ropa',
      };
      // Ask something clearly in the FAQ keywords
      const result = faqFlow.handle(merchant, '¿cuánto demora el envío?');
      // The answer must match exactly a configured FAQ (not LLM-invented)
      const ropaFaqs = RopaPlaybookDefaults.faqs ?? [];
      const shippingFaq = ropaFaqs.find((f) => f.keywords.includes('envio'));
      expect(result).toBe(shippingFaq?.answer ?? null);
    });
  });

  // ─── AC-08: Non-covered question → null (fallback) ───────────────────────

  describe('AC-08: Non-covered question → null (no crash, orchestrator fallback)', () => {
    it('AC-08: Question not covered by FAQs returns null', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-1',
        name: 'Store',
        industry: 'ropa',
      };
      const result = faqFlow.handle(merchant, '¿Venden bicicletas?');
      expect(result).toBeNull();
    });

    it('AC-08: Completely unrelated query returns null without throwing', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-1',
        name: 'Store',
      };
      expect(() => faqFlow.handle(merchant, 'xyzzy abracadabra nonsense')).not.toThrow();
      const result = faqFlow.handle(merchant, 'xyzzy abracadabra nonsense');
      expect(result).toBeNull();
    });

    it('AC-08: Empty query returns null without throwing', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-1',
        name: 'Store',
      };
      expect(() => faqFlow.handle(merchant, '')).not.toThrow();
      const result = faqFlow.handle(merchant, '');
      expect(result).toBeNull();
    });
  });

  // ─── AC-06: PATCH /merchants/me/playbook — faqs field integration ─────────

  describe('AC-06: PlaybookService.getPlaybookForMerchant merges faqs from playbookConfig', () => {
    it('AC-06: merchant playbookConfig.faqs overrides industry defaults', () => {
      const customFaqs: Faq[] = [
        {
          question: '¿Tienen descuentos?',
          keywords: ['descuento', 'oferta', 'promocion'],
          answer: 'Sí, 10% off en primera compra con código BIENVENIDO 🎉',
        },
      ];

      const merchant: MerchantPlaybookData = {
        id: 'merchant-override',
        name: 'Override Store',
        industry: 'ropa',
        playbookConfig: { faqs: customFaqs } as unknown as Record<string, unknown>,
      };

      const resolved = playbookService.getPlaybookForMerchant(merchant);
      expect(resolved.faqs).toEqual(customFaqs);
    });

    it('AC-06: merchant without playbookConfig.faqs uses industry preset FAQs', () => {
      const merchant: MerchantPlaybookData = {
        id: 'merchant-default',
        name: 'Default Store',
        industry: 'ropa',
      };

      const resolved = playbookService.getPlaybookForMerchant(merchant);
      expect(Array.isArray(resolved.faqs)).toBe(true);
      expect(resolved.faqs!.length).toBeGreaterThanOrEqual(5);
    });
  });
});
