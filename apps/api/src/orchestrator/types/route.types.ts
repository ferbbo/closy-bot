/**
 * PR-03.5.1: RouteDecision Types
 * REQ-06: New types for routing decisions
 */

import type { IntentKey } from './intent.types';

// AC-06: Route type for execution path
export type RouteType = 'TEMPLATE' | 'LLM_FALLBACK' | 'GENERIC';

// AC-06: RouteDecision for final routing
export interface RouteDecision {
  route: RouteType;
  intent: IntentKey;
  reason: string; // Why this route was selected
}

// REQ-04: Context for route decision (includes conversation state)
export interface RouteContext {
  conversationId: string;
  lastIntent?: IntentKey;
  merchantId: string;
  confidenceThresholdHigh?: number;
  confidenceThresholdLow?: number;
}
