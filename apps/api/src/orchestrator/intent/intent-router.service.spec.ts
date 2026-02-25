import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntentRouterService } from './intent-router.service';
import type { IntentContext } from '../types/intent.types';

/**
 * PR-03.5.1: IntentRouter V2 Tests
 * Tests for REQ-01 to REQ-05 and AC-01 to AC-05
 */
describe('IntentRouterService V2 (PR-03.5.1)', () => {
  let service: IntentRouterService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'INTENT_CONFIDENCE_THRESHOLD_HIGH') return 5;
        if (key === 'INTENT_CONFIDENCE_THRESHOLD_LOW') return 2;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentRouterService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<IntentRouterService>(IntentRouterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // REQ-01, AC-01: Text normalization (lowercase, remove accents, collapse spaces)
  describe('AC-01: normalizeText', () => {
    it('should convert to lowercase', () => {
      expect(service.normalizeText('BUSCO CAMISETAS')).toBe('busco camisetas');
    });

    it('should remove accents/tildes', () => {
      expect(service.normalizeText('Búsco camisétas ñ')).toBe('busco camisetas n');
    });

    it('should collapse multiple spaces into one', () => {
      expect(service.normalizeText('busco   camisetas')).toBe('busco camisetas');
    });

    it('should trim whitespace', () => {
      expect(service.normalizeText('  busco camisetas  ')).toBe('busco camisetas');
    });

    it('should handle combined normalization - AC-01 spec example', () => {
      expect(service.normalizeText('Búsco camisetas  ')).toBe('busco camisetas');
    });
  });

  // REQ-02, AC-02: Keyword scoring with weights
  describe('AC-02: scoreIntent with keyword weights', () => {
    it('should score compound phrases higher than single words', () => {
      const text = 'quiero comprar una camiseta';
      const decision = service.classify(text);

      // "quiero comprar" (weight 5) should score > "quiero" (weight 1)
      expect(decision.intent).toBe('ADD_TO_CART');
      expect(decision.confidence).not.toBe('LOW');
    });

    it('should accumulate scores from multiple keyword matches', () => {
      const text = 'busco productos disponibles';
      const decision = service.classify(text);

      // "busco" (weight 3) + "productos" (weight 2) + "disponibles" (weight 2) = 7
      expect(decision.intent).toBe('SEARCH_PRODUCT');
      expect(decision.confidence).toBe('HIGH'); // score >= 5
    });

    it('should handle single keyword match', () => {
      const text = 'busco camisetas';
      const decision = service.classify(text);

      // "busco" (weight 3) → score 3
      expect(decision.intent).toBe('SEARCH_PRODUCT');
      expect(decision.confidence).toBe('MED'); // score >= 2 but < 5
    });
  });

  // REQ-03, AC-03: Confidence levels based on score
  describe('AC-03: Confidence calculation', () => {
    it('should return HIGH confidence for score >= 5', () => {
      const text = 'hola buenos dias'; // GREETING keywords = 10 pts
      const decision = service.classify(text);

      expect(decision.confidence).toBe('HIGH');
    });

    it('should return MED confidence for score >= 2 and < 5', () => {
      const text = 'busco'; // SEARCH_PRODUCT "busco" = 3 pts
      const decision = service.classify(text);

      expect(decision.confidence).toBe('MED');
    });

    it('should return LOW confidence for score < 2', () => {
      const text = 'xyz random text';
      const decision = service.classify(text);

      expect(decision.confidence).toBe('LOW');
      expect(decision.intent).toBe('UNKNOWN');
    });
  });

  // REQ-04, AC-04: Context-aware routing with lastIntent bonus
  describe('AC-04: Context-aware routing', () => {
    it('should boost ADD_TO_CART when lastIntent=SEARCH_PRODUCT - AC-04 spec example', () => {
      const text = 'quiero'; // Ambiguous: could be ADD_TO_CART or SEARCH_PRODUCT

      const context: IntentContext = {
        lastIntent: 'SEARCH_PRODUCT',
      };

      const decision = service.classify(text, context);

      // With context bonus, ADD_TO_CART should win
      expect(decision.intent).toBe('ADD_TO_CART');
    });

    it('should work without context', () => {
      const text = 'hola';
      const decision = service.classify(text); // No context

      expect(decision.intent).toBe('GREETING');
    });

    it('should boost VIEW_CART when lastIntent=ADD_TO_CART', () => {
      const text = 'ver pedido';

      const context: IntentContext = {
        lastIntent: 'ADD_TO_CART',
      };

      const decision = service.classify(text, context);

      // Context bonus should make VIEW_CART score higher
      expect(decision.intent).toBe('VIEW_CART');
    });
  });

  // REQ-05, AC-05: AMBIGUOUS intent when collision detected
  describe('AC-05: Collision detection (AMBIGUOUS)', () => {
    it('should detect AMBIGUOUS when multiple intents have similar scores - AC-05 example', () => {
      // Use keywords with same weight to create collision:
      // SEARCH_PRODUCT: "tienes" = 2
      // ADD_TO_CART: "dame" = 2
      // Score diff = 0 < 2 → AMBIGUOUS
      const text = 'tienes dame';

      const decision = service.classify(text);

      // Should detect AMBIGUOUS due to collision
      expect(decision.intent).toBe('AMBIGUOUS');
      expect(decision.confidence).toBe('LOW');
      expect(decision.reason).toContain('collision');
    });

    it('should NOT be AMBIGUOUS when clear winner exists', () => {
      const text = 'hola'; // Clear GREETING intent
      const decision = service.classify(text);

      expect(decision.intent).toBe('GREETING');
      expect(decision.intent).not.toBe('AMBIGUOUS');
    });

    it('should handle AMBIGUOUS gracefully', () => {
      // Even if we can't trigger AMBIGUOUS easily, validate structure
      const decision = service.classify('random xyz');

      expect(decision).toHaveProperty('intent');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('signals');
      expect(decision).toHaveProperty('missingSlots');
    });
  });

  // REQ-01 to REQ-05: Full integration tests
  describe('Full classification flow', () => {
    it('should classify GREETING with HIGH confidence', () => {
      const decision = service.classify('Hola, buenos días');

      expect(decision.intent).toBe('GREETING');
      expect(decision.confidence).toBe('HIGH');
    });

    it('should classify SEARCH_PRODUCT with normalization', () => {
      const decision = service.classify('Búsco camisétas');

      expect(decision.intent).toBe('SEARCH_PRODUCT');
    });

    it('should classify ADD_TO_CART with context bonus', () => {
      const context: IntentContext = {
        lastIntent: 'SEARCH_PRODUCT',
      };

      const decision = service.classify('quiero eso', context);

      expect(decision.intent).toBe('ADD_TO_CART');
    });

    it('should return UNKNOWN for unrecognized text', () => {
      const decision = service.classify('xyz abc 123');

      expect(decision.intent).toBe('UNKNOWN');
      expect(decision.confidence).toBe('LOW');
    });

    it('should include signals in decision', () => {
      const decision = service.classify('busco productos');

      expect(decision.signals).toBeDefined();
      expect(decision.signals.length).toBeGreaterThan(0);
    });

    it('should include reason in decision', () => {
      const decision = service.classify('hola');

      expect(decision.reason).toBeDefined();
      expect(typeof decision.reason).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-12 (PR-05): CHECKOUT intent classification
  // REQ-11: Intent CHECKOUT detectado con keywords
  // ---------------------------------------------------------------------------

  describe('AC-12 (PR-05): CHECKOUT intent', () => {
    it("AC-12: should classify 'quiero pagar' as CHECKOUT with HIGH confidence", () => {
      const decision = service.classify('quiero pagar');

      expect(decision.intent).toBe('CHECKOUT');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-12: should classify 'checkout' as CHECKOUT", () => {
      const decision = service.classify('checkout');

      expect(decision.intent).toBe('CHECKOUT');
    });

    it("should classify 'finalizar pedido' as CHECKOUT", () => {
      const decision = service.classify('quiero finalizar pedido');

      expect(decision.intent).toBe('CHECKOUT');
    });

    it("should classify 'proceder al pago' as CHECKOUT with HIGH confidence", () => {
      const decision = service.classify('proceder al pago');

      expect(decision.intent).toBe('CHECKOUT');
      expect(decision.confidence).toBe('HIGH');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09 (PR-06): CONFIRM_PAYMENT intent
  // ---------------------------------------------------------------------------
  describe('AC-09 (PR-06): CONFIRM_PAYMENT intent', () => {
    it("AC-09: should classify 'ya pague' as CONFIRM_PAYMENT with HIGH confidence", () => {
      const decision = service.classify('ya pague');

      expect(decision.intent).toBe('CONFIRM_PAYMENT');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-09: should classify 'transferí' as CONFIRM_PAYMENT with HIGH confidence", () => {
      const decision = service.classify('transferí');

      expect(decision.intent).toBe('CONFIRM_PAYMENT');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-09: should classify 'pagado' as CONFIRM_PAYMENT with HIGH confidence", () => {
      const decision = service.classify('pagado');

      expect(decision.intent).toBe('CONFIRM_PAYMENT');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-09: should classify 'hice el pago' as CONFIRM_PAYMENT with HIGH confidence", () => {
      const decision = service.classify('hice el pago');

      expect(decision.intent).toBe('CONFIRM_PAYMENT');
      expect(decision.confidence).toBe('HIGH');
    });
  });

  // AC-10 (PR-07): ORDER_STATUS intent
  describe('AC-10 (PR-07): ORDER_STATUS intent', () => {
    it("AC-10: should classify '¿cómo va mi pedido?' as ORDER_STATUS with HIGH confidence", () => {
      const decision = service.classify('¿cómo va mi pedido?');

      expect(decision.intent).toBe('ORDER_STATUS');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-10: should classify 'estado de mi orden' as ORDER_STATUS with HIGH confidence", () => {
      const decision = service.classify('estado de mi orden');

      expect(decision.intent).toBe('ORDER_STATUS');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-10: should classify 'dónde está mi pedido' as ORDER_STATUS with HIGH confidence", () => {
      const decision = service.classify('dónde está mi pedido');

      expect(decision.intent).toBe('ORDER_STATUS');
      expect(decision.confidence).toBe('HIGH');
    });
  });

  // AC-11 (PR-07): CREATE_TICKET intent
  describe('AC-11 (PR-07): CREATE_TICKET intent', () => {
    it("AC-11: should classify 'mi pedido llegó dañado' as CREATE_TICKET with HIGH confidence", () => {
      const decision = service.classify('mi pedido llegó dañado');

      expect(decision.intent).toBe('CREATE_TICKET');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-11: should classify 'tengo un problema con mi compra' as CREATE_TICKET with HIGH confidence", () => {
      const decision = service.classify('tengo un problema con mi compra');

      expect(decision.intent).toBe('CREATE_TICKET');
      expect(decision.confidence).toBe('HIGH');
    });

    it("AC-11: should classify 'el producto no llegó' as CREATE_TICKET with HIGH confidence", () => {
      const decision = service.classify('el producto no llegó');

      expect(decision.intent).toBe('CREATE_TICKET');
      expect(decision.confidence).toBe('HIGH');
    });
  });

  // REQ-03 (PR-08), AC-05: IntentRouter recognizes HANDOFF keywords
  describe('AC-05 (PR-08): HANDOFF intent recognized by IntentRouter', () => {
    it("should classify 'quiero hablar con alguien' as HANDOFF with HIGH confidence", () => {
      const decision = service.classify('quiero hablar con alguien');

      expect(decision.intent).toBe('HANDOFF');
      expect(decision.confidence).toBe('HIGH');
    });

    it("should classify 'quiero persona' as HANDOFF with HIGH confidence", () => {
      const decision = service.classify('quiero persona');

      expect(decision.intent).toBe('HANDOFF');
      expect(decision.confidence).toBe('HIGH');
    });

    it("should classify 'hablar con agente' as HANDOFF with HIGH confidence", () => {
      const decision = service.classify('hablar con agente');

      expect(decision.intent).toBe('HANDOFF');
      expect(decision.confidence).toBe('HIGH');
    });

    it("should classify 'atencion humana' as HANDOFF with HIGH confidence", () => {
      const decision = service.classify('atencion humana');

      expect(decision.intent).toBe('HANDOFF');
      expect(decision.confidence).toBe('HIGH');
    });

    it('should NOT classify a normal product search as HANDOFF', () => {
      const decision = service.classify('busco camisetas talla M');

      expect(decision.intent).not.toBe('HANDOFF');
    });
  });
});
