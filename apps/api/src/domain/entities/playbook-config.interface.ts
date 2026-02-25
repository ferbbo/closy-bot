/**
 * PlaybookConfig Interface (PR-11 / PR-GAP-1)
 * Central config structure for industry playbooks
 * Defines behavior, prompts, and rules per industry
 */

export type Industry = 'ropa' | 'belleza' | 'minimarket';

/**
 * PR-GAP-2: FAQ entry for keyword-based matching (no RAG/embeddings)
 * REQ-01: Faq type with question, keywords, answer
 */
export interface Faq {
  /** Pregunta ejemplo (para referencia humana) */
  question: string;
  /** Keywords de matching (normalizado: lowercase, sin tildes) */
  keywords: string[];
  /** Respuesta del bot (puede contener emojis y saltos de línea) */
  answer: string;
}

export interface PlaybookConfig {
  industry: Industry;
  llmPrompt: LlmPromptConfig;
  checkoutQuestions: CheckoutQuestion[];
  messages: PlaybookMessages;
  rules: PlaybookRules;
  cartConfig?: CartConfig; // PR-04: Cart-specific configuration
  /** PR-GAP-1: High-level personality selector */
  botPersonality?: BotPersonality;
  /** PR-GAP-2: FAQ array for keyword-based matching (no LLM, no embeddings) */
  faqs?: Faq[];
  /** PR-08: Handoff messages for human handoff flow */
  handoffMessages?: HandoffMessages;
}

/**
 * PR-GAP-1: High-level bot personality selector
 * Simplifies merchant customization without editing 20+ LLM fields
 */
export interface BotPersonality {
  /** Preset tone: friendly | professional | enthusiastic | minimal */
  style: 'friendly' | 'professional' | 'enthusiastic' | 'minimal';
  /** Emoji density applied in getMessage() */
  emojiUsage: 'none' | 'moderate' | 'frequent';
  /** Industry signature emoji appended to confirmations */
  signatureEmoji?: string;
}

export interface LlmPromptConfig {
  /** Tone and personality instructions for LLM */
  tone: string;
  /** Key aspects to ask about (size, color, skin type, etc.) */
  focusAreas: string[];
  /** Predefined FAQ topics */
  commonQuestions: string[];
  /** How to suggest additional products */
  upsellStrategy: string;
  /** Emoji usage level */
  emojiUsage: 'none' | 'moderate' | 'frequent';
}

export interface CheckoutQuestion {
  /** Unique key for the question (e.g., "size", "skin_type") */
  key: string;
  /** Display label for the user */
  label: string;
  /** Question type */
  type: 'text' | 'choice' | 'boolean';
  /** Whether this question is required */
  required: boolean;
  /** Options for choice type */
  options?: string[];
  /** Default value */
  default?: string;
}

export interface PlaybookMessages {
  // ── Existing (PR-11) ──────────────────────────────────────────────────────
  /** Initial greeting message. Placeholder: {merchant_name} */
  greeting: string;
  /** Confirmation message when item added to cart */
  addToCartConfirm: string;
  /** Message when product is out of stock */
  noStock: string;
  /** Template for upsell suggestions. Placeholder: {product} */
  upsellTemplate: string;
  /** Message when starting checkout */
  checkoutStart: string;

  // ── New (PR-GAP-1) ────────────────────────────────────────────────────────
  /** No search results. Placeholder: {query} */
  searchNoResults: string;
  /** Search results header. Placeholders: {query}, {count} */
  searchResultsHeader: string;
  /** Search results footer */
  searchResultsFooter: string;
  /** Help menu message */
  helpMenu: string;
  /** Empty cart message */
  cartEmpty: string;
  /** Cart summary header. Placeholders: {item_count}, {item_word} */
  cartSummaryHeader: string;
  /** Cart summary footer. Placeholder: {total} */
  cartSummaryFooter: string;
  /** Remove item confirmation. Placeholders: {product_name}, {variant_name} */
  removeConfirm: string;
  /** Update quantity confirmation. Placeholders: {product_name}, {quantity} */
  updateConfirm: string;
  /** Invalid quantity message */
  quantityInvalid: string;
  /** Product not found after search. Placeholder: {query} */
  productNotFound: string;
  /** Multiple products found. Placeholder: {product_list} */
  productMultipleOptions: string;
  /** Multiple variants found. Placeholders: {product_name}, {variant_list} */
  variantMultipleOptions: string;
  /** Item not in cart. Placeholders: {query}, {items_list} */
  itemNotInCart: string;
  /** Cart empty when action attempted. Placeholder: {action} */
  cartEmptyNoAction: string;
  /** Generic error. Placeholder: {action} */
  genericError: string;
  /** Unknown intent fallback */
  unknownIntent: string;

  // ── PR-07: Post-sale templates ─────────────────────────────────────────────
  /** Order status template. Placeholders: {orderCode}, {statusMessage} */
  orderStatusTemplate: string;
  /** Status message: pending_payment */
  orderStatusPendingPayment: string;
  /** Status message: confirmed */
  orderStatusConfirmed: string;
  /** Status message: paid */
  orderStatusPaid: string;
  /** Status message: shipped. Placeholder: {trackingInfo} */
  orderStatusShipped: string;
  /** Status message: delivered */
  orderStatusDelivered: string;
  /** Status message: cancelled */
  orderStatusCancelled: string;
  /** No order found message */
  noOrderFound: string;
  /** Ticket type selection prompt */
  ticketTypePrompt: string;
  /** Ticket created confirmation. Placeholder: {ticketId} */
  ticketCreatedConfirm: string;
  /** Prompt asking for ticket description */
  ticketDescriptionPrompt: string;
}

export interface PlaybookRules {
  /** Ask for size before adding to cart (Ropa) */
  askSizeBeforeCart: boolean;
  /** Ask skin type during product search (Belleza) */
  askSkinTypeOnSearch: boolean;
  /** Offer automatic substitutions for out-of-stock items (Minimarket) */
  autoSubstitutions: boolean;
  /** Enable upsell suggestions */
  upsellEnabled: boolean;
  /** Max number of product recommendations */
  maxRecommendations: number;
}

/**
 * CartConfig (PR-04)
 * Cart-specific configuration per industry playbook
 */
export interface CartConfig {
  /** Cart TTL in hours (default 24) */
  ttlHours: number;
}

/**
 * HandoffMessages (PR-08)
 * Messages used by HandoffFlow for human handoff notifications
 */
export interface HandoffMessages {
  /** Message sent to customer when they explicitly request handoff. Placeholder: {merchant_name} */
  requestReceived: string;
  /** Message sent to customer when auto-escalation is detected (3+ UNKNOWN loops) */
  escalationDetected: string;
  /** Template for merchant WhatsApp notification. Placeholders: {customerName}, {summary} */
  merchantNotification: string;
}
