/**
 * PR-03.5.1: IntentRouter V2 Types
 * REQ-06: New types for intent classification and routing
 */

// AC-06: IntentKey union type (expandable)
export type IntentKey =
  | 'GREETING'
  | 'SEARCH_PRODUCT'
  | 'ADD_TO_CART'
  | 'VIEW_CART'
  | 'UPDATE_CART'
  | 'REMOVE_FROM_CART'
  | 'HELP'
  | 'CHECKOUT'
  | 'QUERY_FAQ'
  | 'CONFIRM_PAYMENT' // PR-06 REQ-07: manual payment confirmation
  | 'ORDER_STATUS' // PR-07 REQ-07: post-sale order status query
  | 'CREATE_TICKET' // PR-07 REQ-08: post-sale ticket creation
  | 'HANDOFF'
  | 'UNKNOWN'
  | 'AMBIGUOUS'; // REQ-05: New intent for collision detection

// AC-06: Confidence level for intent classification
export type ConfidenceLevel = 'HIGH' | 'MED' | 'LOW';

// AC-06: IntentDecision with confidence, reason, signals, and missing slots
export interface IntentDecision {
  intent: IntentKey;
  confidence: ConfidenceLevel;
  reason: string; // Human-readable explanation
  signals: string[]; // Matched keywords/patterns
  missingSlots: string[]; // Required context missing (for future context gathering)
}

// REQ-04: Context for intent classification (context-aware routing)
export interface IntentContext {
  lastIntent?: IntentKey; // Previous intent for context-aware scoring
  conversationId?: string; // For logging/debugging
}
