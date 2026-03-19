/**
 * PR-04.0 — ExpectingState Types
 * REQ-01: Interface ExpectingState for multi-step conversational flows.
 *
 * Unified state mechanism for search, cart_management, and checkout flows.
 * Persisted in Conversation.metadata.expecting (single key).
 */

export type ExpectingFlow = 'search_selection' | 'cart_management' | 'checkout';

export type ExpectingType =
  // search_selection types
  | 'ask_search_query' // bare "buscar" — ask user for keyword
  | 'select_product' // numbered list shown, awaiting selection
  | 'product_options' // product selected: 1) add 2) details 3) cancel
  | 'view_details' // details shown: 1) add 2) cancel
  // cart_management types
  | 'select_action' // cart listed: "eliminar N" or "modificar N"
  | 'confirm_action' // item selected, confirm action menu
  | 'select_quantity' // awaiting new quantity
  // checkout types
  | 'input_name'
  | 'input_address'
  | 'select_payment'
  | 'confirm_order';

export interface ExpectingStateData {
  /** Search result products (max 5) — from CatalogService, never LLM */
  products?: Array<{ id: string; name: string; price: number; stock: number }>;
  /** Product selected from the numbered list */
  selectedProduct?: { id: string; name: string; price: number };
  /** Cart items snapshot in display order (cart_management) */
  cartItems?: Array<{ id: string; name: string; qty: number }>;
  /** Pending cart action in cart_management */
  pendingAction?: 'remove' | 'modify';
  /** 1-based index of selected cart item */
  selectedItemIndex?: number;
  /** Maximum stock available for selected product */
  maxStock?: number;
  /** Original search query used for pagination (re-search on next page) */
  searchQuery?: string;
  /** Current page in paginated search (1-based) */
  page?: number;
  /** Whether there are more search results on the next page */
  hasMore?: boolean;
  /** Checkout: active cart ID */
  cartId?: string;
  /** Checkout: captured customer name */
  checkoutName?: string;
  /** Checkout: captured delivery address */
  checkoutAddress?: string;
  /** Checkout: selected payment method */
  checkoutPaymentMethod?: string;
  /** Checkout: label for selected payment method */
  checkoutPaymentMethodLabel?: string;
  /** Checkout/select_payment: number of invalid attempts */
  invalidAttempts?: number;
  /** Checkout: ISO timestamp when checkout started */
  startedAt?: string;
}

/**
 * REQ-01: ExpectingState — unified multi-step state for all conversational flows.
 * Persisted as Conversation.metadata.expecting.
 */
export interface ExpectingState {
  /** Which flow is active */
  flow: ExpectingFlow;
  /** Current step within the flow */
  type: ExpectingType;
  /** Flow-specific data payload */
  data: ExpectingStateData;
  /**
   * ISO expiry timestamp.
   * cart/search: +10 min; checkout: +30 min (hardcoded in V1)
   */
  expiresAt: string;
}
