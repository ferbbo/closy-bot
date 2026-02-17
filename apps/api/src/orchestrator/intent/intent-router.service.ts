import { Injectable, Logger } from '@nestjs/common';

export type IntentType = 'SEARCH_PRODUCT' | 'GREETING' | 'HELP' | 'UNKNOWN';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities?: {
    query?: string; // extracted search query
  };
}

/**
 * IntentRouterService
 * Simple keyword-based intent classification (no LLM for MVP)
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  // Keywords for each intent
  private readonly keywords = {
    GREETING: [
      'hola',
      'buenos días',
      'buenas tardes',
      'buenas noches',
      'buen día',
      'hey',
      'holi',
      'saludos',
    ],
    HELP: ['ayuda', 'cómo funciona', 'menú', 'opciones', 'qué puedo hacer', 'comandos'],
    SEARCH_PRODUCT: [
      'busco',
      'quiero',
      'tienes',
      'tienen',
      'producto',
      'productos',
      'necesito',
      'buscar',
      'mostrar',
      'ver',
      'precio',
      'stock',
      'disponible',
      'vender',
      'comprar',
    ],
  };

  /**
   * Classify user message intent using keyword matching
   *
   * @param text - User message text
   * @returns IntentResult with intent type, confidence, and extracted entities
   */
  classify(text: string): IntentResult {
    const normalizedText = text.toLowerCase().trim();

    this.logger.debug(`Classifying intent for message (${text.length} chars)`);

    // Check GREETING
    if (this.matchesKeywords(normalizedText, this.keywords.GREETING)) {
      return {
        intent: 'GREETING',
        confidence: 0.9,
      };
    }

    // Check HELP
    if (this.matchesKeywords(normalizedText, this.keywords.HELP)) {
      return {
        intent: 'HELP',
        confidence: 0.9,
      };
    }

    // Check SEARCH_PRODUCT
    if (this.matchesKeywords(normalizedText, this.keywords.SEARCH_PRODUCT)) {
      const query = this.extractSearchQuery(normalizedText);
      return {
        intent: 'SEARCH_PRODUCT',
        confidence: 0.8,
        entities: {
          query,
        },
      };
    }

    // Default to UNKNOWN
    return {
      intent: 'UNKNOWN',
      confidence: 0.5,
      entities: {
        query: normalizedText, // Use full text as potential search query
      },
    };
  }

  /**
   * Check if text contains any of the keywords
   */
  private matchesKeywords(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Extract search query from text by removing trigger keywords
   */
  private extractSearchQuery(text: string): string {
    let query = text;

    // Remove common trigger words
    const triggerWords = ['busco', 'quiero', 'tienes', 'necesito', 'buscar', 'mostrar', 'ver'];

    for (const word of triggerWords) {
      query = query.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    }

    // Clean up whitespace
    query = query.trim().replace(/\s+/g, ' ');

    // If query is empty or too short, return original text
    if (query.length < 2) {
      return text;
    }

    return query;
  }
}
