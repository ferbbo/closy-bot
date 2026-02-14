import { LlmContext } from '../interfaces/llm-provider.interface';
import { BASE_SYSTEM_PROMPT } from './base-system-prompt';
import { ROPA_PLAYBOOK_STUB } from './industry-defaults/ropa';
import { BELLEZA_PLAYBOOK_STUB } from './industry-defaults/belleza';
import { MINIMARKET_PLAYBOOK_STUB } from './industry-defaults/minimarket';

/**
 * Builds composable system prompt from:
 * - Base guardrails
 * - Industry playbook
 * - Merchant-specific info
 * - Current context (cart, products)
 */

export interface SystemPromptParams {
  merchantName: string;
  industry?: 'ropa' | 'belleza' | 'minimarket';
  context?: LlmContext;
}

export class PlaybookPromptBuilder {
  /**
   * Build complete system prompt with all layers
   */
  static build(params: SystemPromptParams): string {
    const parts: string[] = [BASE_SYSTEM_PROMPT];

    // Add industry-specific playbook (stub for MVP)
    if (params.industry) {
      const playbookPrompt = this.getIndustryPlaybook(params.industry);
      if (playbookPrompt) {
        parts.push('\n---\n## CONTEXTO DE INDUSTRIA\n\n' + playbookPrompt);
      }
    }

    // Add merchant-specific context
    parts.push(this.buildMerchantContext(params.merchantName, params.context));

    // Add current context (cart, products)
    if (params.context) {
      parts.push(this.buildCurrentContext(params.context));
    }

    return parts.join('\n');
  }

  /**
   * Get industry playbook stub
   */
  private static getIndustryPlaybook(industry: string): string {
    switch (industry) {
      case 'ropa':
        return ROPA_PLAYBOOK_STUB;
      case 'belleza':
        return BELLEZA_PLAYBOOK_STUB;
      case 'minimarket':
        return MINIMARKET_PLAYBOOK_STUB;
      default:
        return '';
    }
  }

  /**
   * Build merchant-specific context section
   */
  private static buildMerchantContext(merchantName: string, context?: LlmContext): string {
    const lines = [
      '---',
      '## CONTEXTO DEL MERCHANT',
      '',
      `Estás representando a: **${merchantName}**`,
    ];

    // Future: add merchant-specific policies, shipping info, etc.
    if (context?.playbook?.customGuidelines) {
      lines.push('', '**Directrices específicas:**');
      context.playbook.customGuidelines.forEach((guideline) => {
        lines.push(`- ${guideline}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Build current context section (cart, products available)
   */
  private static buildCurrentContext(context: LlmContext): string {
    const lines: string[] = ['---', '## CONTEXTO ACTUAL'];

    // Current cart
    if (context.currentCart && context.currentCart.itemCount > 0) {
      lines.push('', '**Carrito actual del cliente:**');
      lines.push(`- ${context.currentCart.itemCount} items`);
      lines.push(`- Total: ${context.currentCart.total}`);
      if (context.currentCart.items.length > 0) {
        lines.push('- Items:', ...context.currentCart.items.map((item) => `  - ${item}`));
      }
    }

    // Available products
    if (context.availableProducts && context.availableProducts.length > 0) {
      lines.push('', '**Productos disponibles en este contexto:**');
      context.availableProducts.forEach((product) => {
        const stockStatus = product.inStock ? '✅ En stock' : '❌ Agotado';
        lines.push(`- ${product.name} (${product.sku}): ${product.price} - ${stockStatus}`);
      });
      lines.push(
        '',
        'IMPORTANTE: Presenta estos productos al cliente si son relevantes. USA los precios y stock EXACTOS mostrados arriba.',
      );
    }

    return lines.join('\n');
  }
}
