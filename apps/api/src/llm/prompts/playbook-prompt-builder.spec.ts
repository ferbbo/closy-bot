import { PlaybookPromptBuilder } from './playbook-prompt-builder';
import { LlmContext } from '../interfaces/llm-provider.interface';

describe('PlaybookPromptBuilder', () => {
  describe('build', () => {
    it('should build basic prompt with merchant name', () => {
      const result = PlaybookPromptBuilder.build({
        merchantName: 'Test Store',
      });

      expect(result).toContain('asistente de ventas');
      expect(result).toContain('Test Store');
      expect(result).toContain('GUARDRAILS');
    });

    it('should include ropa industry playbook', () => {
      const result = PlaybookPromptBuilder.build({
        merchantName: 'Fashion Boutique',
        industry: 'ropa',
      });

      expect(result).toContain('CONTEXTO DE INDUSTRIA');
      expect(result).toContain('Ropa y Moda');
      expect(result).toContain('talla');
      expect(result).toContain('color');
    });

    it('should include belleza industry playbook', () => {
      const result = PlaybookPromptBuilder.build({
        merchantName: 'Beauty Shop',
        industry: 'belleza',
      });

      expect(result).toContain('Belleza y Cosméticos');
      expect(result).toContain('piel');
      expect(result).toContain('NUNCA dar consejos médicos');
    });

    it('should include minimarket industry playbook', () => {
      const result = PlaybookPromptBuilder.build({
        merchantName: 'Quick Market',
        industry: 'minimarket',
      });

      expect(result).toContain('Minimarket');
      expect(result).toContain('sustituciones');
      expect(result).toContain('urgencia');
    });

    it('should include merchant context section', () => {
      const result = PlaybookPromptBuilder.build({
        merchantName: 'My Store',
      });

      expect(result).toContain('CONTEXTO DEL MERCHANT');
      expect(result).toContain('**My Store**');
    });

    it('should include custom guidelines if provided', () => {
      const context: LlmContext = {
        merchantName: 'Store',
        playbook: {
          name: 'custom',
          customGuidelines: ['Always offer free shipping', 'Mention our loyalty program'],
        },
      };

      const result = PlaybookPromptBuilder.build({
        merchantName: 'Store',
        context,
      });

      expect(result).toContain('Always offer free shipping');
      expect(result).toContain('Mention our loyalty program');
    });

    it('should include current cart context', () => {
      const context: LlmContext = {
        merchantName: 'Store',
        currentCart: {
          itemCount: 3,
          total: '$75.000',
          items: ['Camisa x2', 'Pantalón x1'],
        },
      };

      const result = PlaybookPromptBuilder.build({
        merchantName: 'Store',
        context,
      });

      expect(result).toContain('CONTEXTO ACTUAL');
      expect(result).toContain('Carrito actual del cliente');
      expect(result).toContain('3 items');
      expect(result).toContain('$75.000');
      expect(result).toContain('Camisa x2');
    });

    it('should not include cart section if cart is empty', () => {
      const context: LlmContext = {
        merchantName: 'Store',
        currentCart: {
          itemCount: 0,
          total: '$0',
          items: [],
        },
      };

      const result = PlaybookPromptBuilder.build({
        merchantName: 'Store',
        context,
      });

      expect(result).not.toContain('Carrito actual del cliente');
    });

    it('should include available products', () => {
      const context: LlmContext = {
        merchantName: 'Store',
        availableProducts: [
          { sku: 'SKU-001', name: 'Camisa Azul', price: '$30.000', inStock: true },
          { sku: 'SKU-002', name: 'Pantalón Negro', price: '$45.000', inStock: false },
        ],
      };

      const result = PlaybookPromptBuilder.build({
        merchantName: 'Store',
        context,
      });

      expect(result).toContain('Productos disponibles en este contexto');
      expect(result).toContain('Camisa Azul');
      expect(result).toContain('SKU-001');
      expect(result).toContain('$30.000');
      expect(result).toContain('✅ En stock');
      expect(result).toContain('Pantalón Negro');
      expect(result).toContain('❌ Agotado');
      expect(result).toContain('USA los precios y stock EXACTOS');
    });

    it('should handle context without products', () => {
      const context: LlmContext = {
        merchantName: 'Store',
      };

      const result = PlaybookPromptBuilder.build({
        merchantName: 'Store',
        context,
      });

      expect(result).not.toContain('Productos disponibles');
    });

    it('should handle complete context with all sections', () => {
      const context: LlmContext = {
        merchantName: 'Fashion Store',
        industry: 'ropa',
        playbook: {
          name: 'ropa-premium',
          customGuidelines: ['Emphasize quality materials'],
        },
        currentCart: {
          itemCount: 1,
          total: '$30.000',
          items: ['Camisa Premium x1'],
        },
        availableProducts: [
          { sku: 'PRM-001', name: 'Camisa Premium', price: '$30.000', inStock: true },
        ],
      };

      const result = PlaybookPromptBuilder.build({
        merchantName: 'Fashion Store',
        industry: 'ropa',
        context,
      });

      // Should have all sections
      expect(result).toContain('GUARDRAILS'); // base
      expect(result).toContain('Ropa y Moda'); // industry
      expect(result).toContain('Fashion Store'); // merchant
      expect(result).toContain('Emphasize quality materials'); // custom guidelines
      expect(result).toContain('Carrito actual'); // cart
      expect(result).toContain('Productos disponibles'); // products
    });
  });
});
