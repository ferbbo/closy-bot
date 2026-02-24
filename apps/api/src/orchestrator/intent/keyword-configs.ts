/**
 * PR-03.5.1: Keyword configurations for IntentRouter V2
 * REQ-02: Keyword scoring with weights (not cascade)
 */

import type { IntentKey } from '../types/intent.types';

export interface KeywordConfig {
  phrase: string; // Keyword or phrase to match
  weight: number; // Score weight (1-5, higher = more confident)
}

// REQ-02: Keyword configurations with weights per intent
export const INTENT_KEYWORDS: Record<IntentKey, KeywordConfig[]> = {
  GREETING: [
    { phrase: 'hola', weight: 5 },
    { phrase: 'buenos dias', weight: 5 },
    { phrase: 'buenas tardes', weight: 5 },
    { phrase: 'buenas noches', weight: 5 },
    { phrase: 'buen dia', weight: 5 },
    { phrase: 'hey', weight: 4 },
    { phrase: 'holi', weight: 4 },
    { phrase: 'saludos', weight: 4 },
  ],

  HELP: [
    { phrase: 'ayuda', weight: 5 },
    { phrase: 'como funciona', weight: 4 },
    { phrase: 'menu', weight: 4 },
    { phrase: 'opciones', weight: 3 },
    { phrase: 'que puedo hacer', weight: 4 },
    { phrase: 'comandos', weight: 3 },
  ],

  VIEW_CART: [
    { phrase: 'carrito', weight: 5 },
    { phrase: 'ver carrito', weight: 5 },
    { phrase: 'mostrar carrito', weight: 5 },
    { phrase: 'que tengo', weight: 4 },
    { phrase: 'mi carrito', weight: 5 },
    { phrase: 'pedido', weight: 3 },
    { phrase: 'ver pedido', weight: 4 },
  ],

  UPDATE_CART: [
    { phrase: 'cambiar', weight: 3 },
    { phrase: 'actualizar', weight: 4 },
    { phrase: 'modificar', weight: 4 },
    { phrase: 'cambiar cantidad', weight: 5 },
    { phrase: 'ajustar', weight: 3 },
  ],

  REMOVE_FROM_CART: [
    { phrase: 'remover', weight: 5 },
    { phrase: 'quitar', weight: 4 },
    { phrase: 'eliminar', weight: 5 },
    { phrase: 'sacar', weight: 3 },
  ],

  ADD_TO_CART: [
    { phrase: 'quiero comprar', weight: 5 }, // REQ-02, AC-02: Higher weight for compound phrase
    { phrase: 'agregar', weight: 3 },
    { phrase: 'anadir', weight: 3 },
    { phrase: 'agrega', weight: 3 },
    { phrase: 'anade', weight: 3 },
    { phrase: 'dame', weight: 2 },
    { phrase: 'quiero', weight: 1 }, // REQ-02, AC-02: Lower weight for ambiguous single word
    { phrase: 'me llevo', weight: 4 },
  ],

  SEARCH_PRODUCT: [
    { phrase: 'busco', weight: 3 },
    { phrase: 'tienes', weight: 2 },
    { phrase: 'tienen', weight: 2 },
    { phrase: 'producto', weight: 2 },
    { phrase: 'productos', weight: 2 },
    { phrase: 'necesito', weight: 2 },
    { phrase: 'buscar', weight: 3 },
    { phrase: 'mostrar', weight: 2 },
    { phrase: 'ver', weight: 1 },
    { phrase: 'precio', weight: 2 },
    { phrase: 'stock', weight: 2 },
    { phrase: 'disponible', weight: 2 },
    { phrase: 'vender', weight: 2 },
    { phrase: 'comprar', weight: 2 },
  ],

  CHECKOUT: [],
  QUERY_FAQ: [],
  HANDOFF: [],
  UNKNOWN: [],
  AMBIGUOUS: [], // REQ-05: No keywords, assigned when collision detected
};

// REQ-04: Context bonuses for intent scoring (context-aware)
export const CONTEXT_BONUSES: Partial<Record<IntentKey, Partial<Record<IntentKey, number>>>> = {
  // After SEARCH_PRODUCT, boost transactional intents
  SEARCH_PRODUCT: {
    ADD_TO_CART: 2,
    VIEW_CART: 1,
  },
  // After ADD_TO_CART, boost cart operations
  ADD_TO_CART: {
    VIEW_CART: 2,
    CHECKOUT: 2,
    UPDATE_CART: 1,
  },
  // After VIEW_CART, boost checkout
  VIEW_CART: {
    CHECKOUT: 2,
    UPDATE_CART: 1,
    REMOVE_FROM_CART: 1,
  },
};
