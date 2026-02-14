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
        'quiero una camisa',
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
  });
});
