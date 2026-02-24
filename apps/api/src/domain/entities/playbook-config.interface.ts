/**
 * PlaybookConfig Interface (PR-11 / PR-GAP-1)
 * Central config structure for industry playbooks
 * Defines behavior, prompts, and rules per industry
 */

export type Industry = 'ropa' | 'belleza' | 'minimarket';

export interface PlaybookConfig {
  industry: Industry;
  llmPrompt: LlmPromptConfig;
  checkoutQuestions: CheckoutQuestion[];
  messages: PlaybookMessages;
  rules: PlaybookRules;
  cartConfig?: CartConfig; // PR-04: Cart-specific configuration
  /** PR-GAP-1: High-level personality selector */
  botPersonality?: BotPersonality;
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
