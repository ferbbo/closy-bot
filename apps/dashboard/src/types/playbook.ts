/**
 * Playbook TypeScript types — mirror of backend playbook-config.interface.ts
 * PR-FE-05: Settings UI
 */

export type Industry = 'ropa' | 'belleza' | 'minimarket';

export interface PlaybookConfig {
  industry: Industry;
  llmPrompt: LlmPromptConfig;
  checkoutQuestions: CheckoutQuestion[];
  messages: PlaybookMessages;
  rules: PlaybookRules;
  cartConfig?: CartConfig;
  botPersonality?: BotPersonality;
  faqs?: Faq[];
  handoffMessages?: HandoffMessages;
}

export interface PlaybookMessages {
  // ── Existing (PR-11) ──────────────────────────────────────────────────────
  /** Placeholder: {merchant_name} */
  greeting: string;
  addToCartConfirm: string;
  noStock: string;
  /** Placeholder: {product} */
  upsellTemplate: string;
  checkoutStart: string;

  // ── PR-GAP-1 ──────────────────────────────────────────────────────────────
  /** Placeholder: {query} */
  searchNoResults: string;
  /** Placeholders: {query}, {count} */
  searchResultsHeader: string;
  searchResultsFooter: string;
  helpMenu: string;
  cartEmpty: string;
  /** Placeholders: {item_count}, {item_word} */
  cartSummaryHeader: string;
  /** Placeholder: {total} */
  cartSummaryFooter: string;
  /** Placeholders: {product_name}, {variant_name} */
  removeConfirm: string;
  /** Placeholders: {product_name}, {quantity} */
  updateConfirm: string;
  quantityInvalid: string;
  /** Placeholder: {query} */
  productNotFound: string;
  /** Placeholder: {product_list} */
  productMultipleOptions: string;
  /** Placeholders: {product_name}, {variant_list} */
  variantMultipleOptions: string;
  /** Placeholders: {query}, {items_list} */
  itemNotInCart: string;
  /** Placeholder: {action} */
  cartEmptyNoAction: string;
  /** Placeholder: {action} */
  genericError: string;
  unknownIntent: string;

  // ── PR-07: Post-sale ────────────────────────────────────────────────────────
  /** Placeholders: {orderCode}, {statusMessage} */
  orderStatusTemplate: string;
  orderStatusPendingPayment: string;
  orderStatusConfirmed: string;
  orderStatusPaid: string;
  /** Placeholder: {trackingInfo} */
  orderStatusShipped: string;
  orderStatusDelivered: string;
  orderStatusCancelled: string;
  noOrderFound: string;
  ticketTypePrompt: string;
  /** Placeholder: {ticketId} */
  ticketCreatedConfirm: string;
  ticketDescriptionPrompt: string;
}

export interface PlaybookRules {
  askSizeBeforeCart: boolean;
  askSkinTypeOnSearch: boolean;
  autoSubstitutions: boolean;
  upsellEnabled: boolean;
  maxRecommendations: number;
}

export interface LlmPromptConfig {
  tone: string;
  focusAreas: string[];
  commonQuestions: string[];
  upsellStrategy: string;
  emojiUsage: 'none' | 'moderate' | 'frequent';
}

export interface CheckoutQuestion {
  key: string;
  label: string;
  type: 'text' | 'choice' | 'boolean';
  required: boolean;
  options?: string[];
  default?: string;
}

export interface CartConfig {
  ttlHours: number;
}

export interface BotPersonality {
  style: 'friendly' | 'professional' | 'enthusiastic' | 'minimal';
  emojiUsage: 'none' | 'moderate' | 'frequent';
  signatureEmoji?: string;
}

export interface Faq {
  question: string;
  keywords: string[];
  answer: string;
}

export interface HandoffMessages {
  /** Placeholder: {merchant_name} */
  requestReceived: string;
  escalationDetected: string;
  /** Placeholders: {customerName}, {summary} */
  merchantNotification: string;
}

// ── Merchant profile (from GET /merchants/me) ─────────────────────────────

export interface MerchantProfile {
  id: string;
  name: string;
  industry: Industry | null;
  playbookConfig: PlaybookConfig | null;
}
