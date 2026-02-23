import { Injectable, Logger } from '@nestjs/common';

export type IntentType =
  | 'SEARCH_PRODUCT'
  | 'ADD_TO_CART'
  | 'VIEW_CART'
  | 'UPDATE_CART'
  | 'REMOVE_FROM_CART'
  | 'GREETING'
  | 'HELP'
  | 'UNKNOWN';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities?: {
    query?: string; // extracted search query
    productName?: string; // extracted product name for cart operations
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
    VIEW_CART: [
      'carrito',
      'ver carrito',
      'mostrar carrito',
      'qué tengo',
      'mi carrito',
      'pedido',
      'ver pedido',
    ],
    UPDATE_CART: ['cambiar', 'actualizar', 'modificar', 'cambiar cantidad', 'ajustar'],
    REMOVE_FROM_CART: ['remover', 'quitar', 'eliminar', 'sacar'],
    ADD_TO_CART: [
      'agregar',
      'añadir',
      'agrega',
      'añade',
      'dame',
      'quiero comprar',
      'quiero',
      'me llevo',
    ],
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

    // AC-13: Check ADD_TO_CART FIRST (higher priority than VIEW_CART to avoid "agregar al carrito" collision)
    if (this.matchesKeywords(normalizedText, this.keywords.ADD_TO_CART)) {
      const productName = this.extractProductName(normalizedText, this.keywords.ADD_TO_CART);
      return {
        intent: 'ADD_TO_CART',
        confidence: 0.85,
        entities: {
          productName,
        },
      };
    }

    // AC-14: Check VIEW_CART (high confidence for explicit cart keywords)
    if (this.matchesKeywords(normalizedText, this.keywords.VIEW_CART)) {
      return {
        intent: 'VIEW_CART',
        confidence: 0.85,
      };
    }

    // AC-09: Check UPDATE_CART (must have update keyword + product reference + quantity)
    if (this.matchesKeywords(normalizedText, this.keywords.UPDATE_CART)) {
      const productName = this.extractProductName(normalizedText, this.keywords.UPDATE_CART);
      return {
        intent: 'UPDATE_CART',
        confidence: 0.75,
        entities: {
          productName,
        },
      };
    }

    // AC-15: Check REMOVE_FROM_CART (must have remove keyword + product reference)
    if (this.matchesKeywords(normalizedText, this.keywords.REMOVE_FROM_CART)) {
      const productName = this.extractProductName(normalizedText, this.keywords.REMOVE_FROM_CART);
      return {
        intent: 'REMOVE_FROM_CART',
        confidence: 0.75,
        entities: {
          productName,
        },
      };
    }

    // Check SEARCH_PRODUCT
    if (this.matchesKeywords(normalizedText, this.keywords.SEARCH_PRODUCT)) {
      const query = this.extractSearchQuery(normalizedText);
      return {
        intent: 'SEARCH_PRODUCT',
        confidence: 0.7,
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

  /**
   * Extract product name from cart operation messages
   * Removes action keywords (agregar, quitar, etc.)
   */
  private extractProductName(text: string, actionKeywords: string[]): string {
    let productName = text;

    // Remove action keywords
    for (const keyword of actionKeywords) {
      productName = productName.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '');
    }

    // Remove common filler words
    const fillerWords = ['al carrito', 'del carrito', 'de', 'la', 'el', 'un', 'una'];
    for (const word of fillerWords) {
      productName = productName.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    }

    // Clean up whitespace
    productName = productName.trim().replace(/\s+/g, ' ');

    // If empty, return original text
    if (productName.length < 2) {
      return text;
    }

    return productName;
  }
}
