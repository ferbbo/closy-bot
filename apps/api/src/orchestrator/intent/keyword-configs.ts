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
    { phrase: 'tendras', weight: 2 }, // Colloquial future: "¿tendrás vestidos?"
    { phrase: 'tendran', weight: 2 },
    { phrase: 'hay', weight: 2 }, // "¿hay camisas?"
    { phrase: 'producto', weight: 2 },
    { phrase: 'productos', weight: 2 },
    { phrase: 'necesito', weight: 2 },
    { phrase: 'buscar', weight: 3 },
    { phrase: 'mostrar', weight: 2 },
    { phrase: 'muestrame', weight: 2 },
    { phrase: 'quiero', weight: 2 }, // "quiero jeans"
    { phrase: 'quisiera', weight: 2 },
    { phrase: 'ver', weight: 1 },
    { phrase: 'precio', weight: 2 },
    { phrase: 'stock', weight: 2 },
    { phrase: 'disponible', weight: 2 },
    { phrase: 'vender', weight: 2 },
    { phrase: 'venden', weight: 2 },
    { phrase: 'comprar', weight: 2 },
    // Continuation keywords (work with SEARCH_PRODUCT → SEARCH_PRODUCT context bonus)
    { phrase: 'también', weight: 1 },
    { phrase: 'tambien', weight: 1 },
    { phrase: 'además', weight: 1 },
    { phrase: 'ademas', weight: 1 },
    { phrase: 'otro', weight: 1 },
    { phrase: 'otra', weight: 1 },
    { phrase: 'otros', weight: 1 },
    { phrase: 'otras', weight: 1 },
  ],

  CHECKOUT: [
    { phrase: 'quiero pagar', weight: 5 }, // REQ-11, AC-12: Primary checkout trigger
    { phrase: 'checkout', weight: 5 },
    { phrase: 'finalizar', weight: 4 },
    { phrase: 'finalizar pedido', weight: 5 },
    { phrase: 'pagar', weight: 4 },
    { phrase: 'confirmar pedido', weight: 5 },
    { phrase: 'realizar pedido', weight: 4 },
    { phrase: 'hacer pedido', weight: 4 },
    { phrase: 'proceder al pago', weight: 5 },
    { phrase: 'completar compra', weight: 5 },
  ],

  // PR-07 REQ-07: ORDER_STATUS — post-sale order status query (AC-10)
  ORDER_STATUS: [
    { phrase: 'estado', weight: 5 },
    { phrase: 'como va mi pedido', weight: 5 },
    { phrase: 'donde esta mi pedido', weight: 5 },
    { phrase: 'mi pedido', weight: 3 },
    { phrase: 'mi orden', weight: 3 },
    { phrase: 'tracking', weight: 4 },
    { phrase: 'seguimiento', weight: 4 },
    { phrase: 'como va', weight: 3 },
    { phrase: 'mi compra', weight: 3 },
  ],

  // PR-07 REQ-08: CREATE_TICKET — post-sale ticket creation (AC-11)
  CREATE_TICKET: [
    { phrase: 'problema', weight: 5 },
    { phrase: 'reclamo', weight: 5 },
    { phrase: 'falta', weight: 4 },
    { phrase: 'no llego', weight: 5 },
    { phrase: 'dañado', weight: 5 },
    { phrase: 'danado', weight: 5 },
    { phrase: 'daño', weight: 5 },
    { phrase: 'demora', weight: 4 },
    { phrase: 'tardanza', weight: 4 },
    { phrase: 'incompleto', weight: 4 },
    { phrase: 'no funciona', weight: 5 },
    { phrase: 'roto', weight: 5 },
  ],

  // PR-06 REQ-07: CONFIRM_PAYMENT — fallback manual "PAGADO" command (AC-09)
  CONFIRM_PAYMENT: [
    { phrase: 'pagado', weight: 5 },
    { phrase: 'ya pague', weight: 5 },
    { phrase: 'ya pagüé', weight: 5 },
    { phrase: 'pague', weight: 4 },
    { phrase: 'transferí', weight: 5 },
    { phrase: 'transferi', weight: 5 },
    { phrase: 'ya transferí', weight: 5 },
    { phrase: 'hice el pago', weight: 5 },
    { phrase: 'hice la transferencia', weight: 5 },
    { phrase: 'realice el pago', weight: 4 },
    { phrase: 'ya pague mi pedido', weight: 5 },
    { phrase: 'confirmar pago', weight: 5 },
  ],
  QUERY_FAQ: [
    // Envío
    { phrase: 'envio', weight: 4 },
    { phrase: 'envío', weight: 4 },
    { phrase: 'demora', weight: 4 },
    { phrase: 'llega', weight: 4 },
    { phrase: 'dias', weight: 3 },
    { phrase: 'cuanto demora', weight: 4 },
    // Devoluciones
    { phrase: 'devolver', weight: 4 },
    { phrase: 'devolucion', weight: 4 },
    { phrase: 'cambio', weight: 4 },
    { phrase: 'garantia', weight: 4 },
    // Pagos
    { phrase: 'pago', weight: 3 },
    { phrase: 'transferencia', weight: 3 },
    { phrase: 'efectivo', weight: 3 },
    { phrase: 'como pago', weight: 3 },
    { phrase: 'metodo de pago', weight: 3 },
    { phrase: 'metodos', weight: 3 },
    // Horarios
    { phrase: 'horario', weight: 3 },
    { phrase: 'abierto', weight: 3 },
    { phrase: 'cuando atienden', weight: 3 },
    // Ubicación
    { phrase: 'donde', weight: 2 },
    { phrase: 'direccion', weight: 2 },
    { phrase: 'ubicacion', weight: 2 },
  ],
  // PR-08 REQ-03, AC-05: HANDOFF — human handoff request keywords
  HANDOFF: [
    { phrase: 'hablar con alguien', weight: 5 },
    { phrase: 'quiero persona', weight: 5 },
    { phrase: 'atencion humana', weight: 5 },
    { phrase: 'hablar persona', weight: 5 },
    { phrase: 'quiero hablar con alguien', weight: 5 },
    { phrase: 'comunicarme con alguien', weight: 5 },
    { phrase: 'agente', weight: 3 },
    { phrase: 'representante', weight: 3 },
    { phrase: 'hablar con agente', weight: 5 },
    { phrase: 'ayuda humana', weight: 5 },
    { phrase: 'necesito hablar', weight: 4 },
    { phrase: 'con una persona', weight: 4 },
  ],
  UNKNOWN: [],
  AMBIGUOUS: [], // REQ-05: No keywords, assigned when collision detected
};

/**
 * PR-03.5.1.1: Post-search selection phrase patterns
 * When lastIntent=SEARCH_PRODUCT and message matches one of these patterns,
 * ADD_TO_CART is forced to HIGH confidence (overrides context-bonus collision).
 *
 * Patterns match on NORMALIZED text (lowercase, no accents, trimmed).
 * Examples: "ese", "el 1", "quiero", "me gusta", "lo quiero"
 */
export const POST_SEARCH_SELECTION_PATTERNS: RegExp[] = [
  /^quiero$/, // "quiero" alone (no product noun follows)
  /^quiero\s+(ese|esa|eso|esos|esas)(\s|$)/i, // "quiero ese" / "quiero eso"
  /^(ese|esa|eso|esos|esas)(\s|$)/i, // deictic pronoun at start
  /^el\s+\d+(\s|$)/i, // "el 1", "el 2"
  /^la\s+\d+(\s|$)/i, // "la 1", "la 2"
  /^\d+$/, // just a number "1", "2", "3"
  /^el\s+primer[oa]?(\s|$)/i, // "el primero", "el primera"
  /^la\s+primer[oa]?(\s|$)/i, // "la primera"
  /^el\s+segund[oa]?(\s|$)/i, // "el segundo"
  /^la\s+segund[oa]?(\s|$)/i, // "la segunda"
  /^el\s+tercer[oa]?(\s|$)/i, // "el tercero"
  /^me\s+gusta(\s|$)/i, // "me gusta", "me gusta ese"
  /^lo\s+quiero(\s|$)/i, // "lo quiero"
  /^la\s+quiero(\s|$)/i, // "la quiero"
  /^me\s+lo\s+llevo(\s|$)/i, // "me lo llevo"
  /^me\s+la\s+llevo(\s|$)/i, // "me la llevo"
];

// REQ-04: Context bonuses for intent scoring (context-aware)
export const CONTEXT_BONUSES: Partial<Record<IntentKey, Partial<Record<IntentKey, number>>>> = {
  // After SEARCH_PRODUCT, boost transactional intents AND search continuations
  SEARCH_PRODUCT: {
    ADD_TO_CART: 2,
    VIEW_CART: 1,
    SEARCH_PRODUCT: 3, // Enable "y camisa blanca" continuation after search results
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
