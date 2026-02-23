import { Test, TestingModule } from '@nestjs/testing';
import { IntentRouterService } from './intent-router.service';

describe('IntentRouterService', () => {
  let service: IntentRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntentRouterService],
    }).compile();

    service = module.get<IntentRouterService>(IntentRouterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('classify()', () => {
    it('should classify greeting intent', () => {
      const result = service.classify('hola');
      expect(result.intent).toBe('GREETING');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should classify greeting with different variations', () => {
      const greetings = ['Hola', 'buenos días', 'BUENAS TARDES', 'hey', 'holi'];

      for (const greeting of greetings) {
        const result = service.classify(greeting);
        expect(result.intent).toBe('GREETING');
      }
    });

    it('should classify help intent', () => {
      const result = service.classify('ayuda');
      expect(result.intent).toBe('HELP');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should classify help with different variations', () => {
      const helpMessages = ['ayuda', 'cómo funciona', 'menú', 'opciones', 'qué puedo hacer'];

      for (const message of helpMessages) {
        const result = service.classify(message);
        expect(result.intent).toBe('HELP');
      }
    });

    it('should classify search product intent', () => {
      const result = service.classify('busco zapatillas');
      expect(result.intent).toBe('SEARCH_PRODUCT');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should extract search query from text', () => {
      const result = service.classify('busco zapatillas running');
      expect(result.intent).toBe('SEARCH_PRODUCT');
      expect(result.entities?.query).toBeDefined();
      expect(result.entities?.query).toContain('zapatillas');
    });

    it('should classify product search with different variations', () => {
      const searches = [
        'busco zapatillas',
        // 'quiero una camisa', // Removed: "quiero" now triggers ADD_TO_CART (AC-13)
        'tienes pantalones',
        'necesito zapatos',
        'mostrar camisas',
        'ver productos',
      ];

      for (const search of searches) {
        const result = service.classify(search);
        expect(result.intent).toBe('SEARCH_PRODUCT');
      }
    });

    it('should classify unknown intent for random text', () => {
      const result = service.classify('asdfghjkl');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThanOrEqual(0.6);
    });

    it('should return query entity for unknown intent', () => {
      const result = service.classify('random text');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.entities?.query).toBe('random text');
    });

    it('should handle empty text', () => {
      const result = service.classify('');
      expect(result.intent).toBe('UNKNOWN');
    });

    it('should handle text with only spaces', () => {
      const result = service.classify('   ');
      expect(result.intent).toBe('UNKNOWN');
    });

    it('should extract query by removing trigger words', () => {
      const result = service.classify('busco zapatillas nike running');
      expect(result.entities?.query).not.toContain('busco');
      expect(result.entities?.query).toContain('zapatillas');
      expect(result.entities?.query).toContain('nike');
    });

    // PR-04: Cart intent tests
    describe('AC-13: ADD_TO_CART intent detection', () => {
      it('should detect ADD_TO_CART', () => {
        const result = service.classify('agregar camiseta roja');
        expect(result.intent).toBe('ADD_TO_CART');
        expect(result.confidence).toBeGreaterThan(0.7);
      });

      it('should extract product name', () => {
        const result = service.classify('quiero agregar camiseta roja talla M');
        expect(result.intent).toBe('ADD_TO_CART');
        expect(result.entities?.productName).toContain('camiseta');
      });

      it('should detect variations', () => {
        const variations = [
          'añadir producto',
          'agrega camiseta',
          'quiero comprar zapatos',
          'me llevo la blusa',
        ];

        variations.forEach((text) => {
          const result = service.classify(text);
          expect(result.intent).toBe('ADD_TO_CART');
        });
      });
    });

    describe('AC-14: SHOW_CART intent detection', () => {
      it('should detect SHOW_CART', () => {
        const result = service.classify('ver carrito');
        expect(result.intent).toBe('SHOW_CART');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should detect variations', () => {
        const variations = ['carrito', 'mostrar carrito', 'qué tengo', 'mi carrito', 'ver pedido'];

        variations.forEach((text) => {
          const result = service.classify(text);
          expect(result.intent).toBe('SHOW_CART');
        });
      });
    });

    describe('AC-15: REMOVE_FROM_CART intent detection', () => {
      it('should detect REMOVE_FROM_CART', () => {
        const result = service.classify('quitar camiseta');
        expect(result.intent).toBe('REMOVE_FROM_CART');
        expect(result.confidence).toBeGreaterThan(0.7);
      });

      it('should detect variations', () => {
        const variations = ['remover producto', 'eliminar camiseta', 'sacar zapatos'];

        variations.forEach((text) => {
          const result = service.classify(text);
          expect(result.intent).toBe('REMOVE_FROM_CART');
        });
      });
    });

    describe('Intent priority', () => {
      it('SHOW_CART should have higher priority than SEARCH', () => {
        const result = service.classify('ver productos en carrito');
        expect(result.intent).toBe('SHOW_CART');
      });

      it('ADD_TO_CART should have higher priority than SEARCH', () => {
        const result = service.classify('quiero agregar producto');
        expect(result.intent).toBe('ADD_TO_CART');
      });
    });
  });
});
