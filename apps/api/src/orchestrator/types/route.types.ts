/**
 * PR-03.5.1: RouteDecision Types
 * REQ-06: New types for routing decisions
 */

import type { IntentKey, ConfidenceLevel } from './intent.types';
import type { ExpectingState } from './expecting.types';

// AC-06: Route type for execution path
export type RouteType = 'TEMPLATE' | 'LLM_FALLBACK' | 'GENERIC';

// AC-06: RouteDecision for final routing
export interface RouteDecision {
  route: RouteType;
  intent: IntentKey;
  reason: string; // Why this route was selected
  confidence: ConfidenceLevel; // PR-03.5.1 AC-13: For structured logging
  signals: string[]; // PR-03.5.1 AC-13: Matched keywords for logging
}

// REQ-04: Context for route decision (includes conversation state)
export interface RouteContext {
  conversationId: string;
  lastIntent?: IntentKey;
  merchantId: string;
  confidenceThresholdHigh?: number;
  confidenceThresholdLow?: number;
  /**
   * PR-04.0 REQ-05: Pre-loaded expecting state.
   * If active, used as pre-classification context before intent classification.
   */
  expectingState?: ExpectingState | null;
}
