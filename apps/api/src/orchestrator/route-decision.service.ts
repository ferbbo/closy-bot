import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntentKey, IntentDecision, IntentContext } from './types/intent.types';
import type { RouteDecision, RouteContext } from './types/route.types';
import { IntentRouterService } from './intent/intent-router.service';
import { LlmService } from '../llm/llm.service';

/**
 * RouteDecisionService
 * PR-03.5.1: Orchestrates template-first routing with selective LLM fallback
 *
 * REQ-07: classifyAndRoute() coordinates:
 * - IntentRouter V2 classification
 * - Confidence-based routing (HIGH/MED → TEMPLATE, LOW → check LLM flags)
 * - REQ-10: LLM intent assist for UNKNOWN/AMBIGUOUS (if LLM_INTENT_ASSIST=true)
 * - REQ-11: LLM fallback generation for UNKNOWN (if LLM_FALLBACK_ENABLED=true)
 * - REQ-12: Graceful degradation (LLM failure → GENERIC route)
 */
@Injectable()
export class RouteDecisionService {
  private readonly logger = new Logger(RouteDecisionService.name);

  // REQ-09: Granular LLM flags
  private readonly llmIntentAssist: boolean;
  private readonly llmFallbackEnabled: boolean;
  private readonly llmSummaryEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly intentRouter: IntentRouterService,
    private readonly llmService: LlmService,
  ) {
    // REQ-09, AC-09: Backward compat - if LLM_ENABLED=true, activate all flags
    const legacyLlmEnabled = this.configService.get<boolean>('LLM_ENABLED', false);

    if (legacyLlmEnabled) {
      this.llmIntentAssist = true;
      this.llmFallbackEnabled = true;
      this.llmSummaryEnabled = true;
      this.logger.log('Backward compat: LLM_ENABLED=true → all LLM flags activated');
    } else {
      this.llmIntentAssist = this.configService.get<boolean>('LLM_INTENT_ASSIST', false);
      this.llmFallbackEnabled = this.configService.get<boolean>('LLM_FALLBACK_ENABLED', false);
      this.llmSummaryEnabled = this.configService.get<boolean>('LLM_SUMMARY_ENABLED', false);
    }

    this.logger.log(
      `LLM Flags: IntentAssist=${this.llmIntentAssist}, Fallback=${this.llmFallbackEnabled}, Summary=${this.llmSummaryEnabled}`,
    );
  }

  /**
   * REQ-07, AC-07: Main routing orchestration
   * Template-first: HIGH/MED confidence → TEMPLATE route (no LLM)
   * LOW confidence or UNKNOWN/AMBIGUOUS → check LLM flags for assist/fallback
   *
   * @param text - User message text
   * @param context - Route context (conversation, merchant, lastIntent)
   * @returns RouteDecision with route type, intent, and reason
   */
  async classifyAndRoute(text: string, context: RouteContext): Promise<RouteDecision> {
    const startTime = Date.now();

    // Step 1: REQ-01 to REQ-05 - Classify with IntentRouter V2
    const intentContext: IntentContext = {
      lastIntent: context.lastIntent,
      conversationId: context.conversationId,
    };

    let decision = this.intentRouter.classify(text, intentContext);

    this.logger.debug(
      `Initial classification: ${decision.intent} (${decision.confidence}) - ${decision.reason}`,
    );

    // Step 2: REQ-07, AC-07 - Template-first routing decision
    if (decision.confidence === 'HIGH' || decision.confidence === 'MED') {
      // Template route: deterministic flow execution (no LLM)
      const latencyMs = Date.now() - startTime;
      this.logger.log(
        `TEMPLATE route: ${decision.intent} (${decision.confidence}) | ${latencyMs}ms`,
      );

      return {
        route: 'TEMPLATE',
        intent: decision.intent,
        reason: `Confidence ${decision.confidence} → template flow`,
      };
    }

    // Step 3: REQ-10, AC-10 - LLM intent assist for UNKNOWN/AMBIGUOUS (if enabled)
    if (
      (decision.intent === 'UNKNOWN' || decision.intent === 'AMBIGUOUS') &&
      this.llmIntentAssist
    ) {
      this.logger.debug('Attempting LLM intent assist for reclassification');

      try {
        const reclassified = await this.llmIntentAssist_retry(text, decision, context);
        if (reclassified) {
          decision = reclassified;
          const latencyMs = Date.now() - startTime;
          this.logger.log(
            `LLM assist → TEMPLATE route: ${decision.intent} (${decision.confidence}) | ${latencyMs}ms`,
          );

          return {
            route: 'TEMPLATE',
            intent: decision.intent,
            reason: 'LLM intent assist reclassified → template flow',
          };
        }
      } catch (error) {
        // REQ-12, AC-12: Graceful degradation (LLM failure → continue to next fallback)
        this.logger.warn('LLM intent assist failed, continuing to fallback', error);
      }
    }

    // Step 4: REQ-11, AC-11 - LLM fallback generation for UNKNOWN (if enabled)
    if (decision.intent === 'UNKNOWN' && this.llmFallbackEnabled) {
      const latencyMs = Date.now() - startTime;
      this.logger.log(`LLM_FALLBACK route: ${decision.intent} | ${latencyMs}ms`);

      return {
        route: 'LLM_FALLBACK',
        intent: decision.intent,
        reason: 'LLM_FALLBACK_ENABLED → generate conversational response',
      };
    }

    // Step 5: REQ-12, AC-12 - Generic fallback (no LLM, hardcoded message)
    const latencyMs = Date.now() - startTime;
    this.logger.log(`GENERIC route: ${decision.intent} (no LLM) | ${latencyMs}ms`);

    return {
      route: 'GENERIC',
      intent: decision.intent,
      reason: 'No template match, LLM disabled → generic fallback',
    };
  }

  /**
   * REQ-10, AC-10: LLM intent assist - reclassify UNKNOWN/AMBIGUOUS
   * Uses a short prompt (max 100 tokens) to minimize cost
   *
   * @returns Reclassified IntentDecision or null if still UNKNOWN
   */
  private async llmIntentAssist_retry(
    text: string,
    originalDecision: IntentDecision,
    context: RouteContext,
  ): Promise<IntentDecision | null> {
    // Short prompt with few-shot examples and lastIntent context
    const prompt = this.buildIntentAssistPrompt(text, context.lastIntent);

    try {
      const response = await this.llmService.generateSimple(prompt, {
        maxTokens: 100, // Keep cost low
        temperature: 0.3, // More deterministic
        timeout: 2000, // Short timeout (2s)
      });

      // LLM disabled or unavailable
      if (!response) {
        this.logger.debug('LLM intent assist: LLM returned null (disabled or unavailable)');
        return null;
      }

      // Parse LLM response (expected format: "intent: ADD_TO_CART")
      const intentMatch = response.match(/intent:\s*(\w+)/i);
      if (!intentMatch) {
        this.logger.warn('LLM intent assist: failed to parse response');
        return null;
      }

      const suggestedIntent = intentMatch[1].toUpperCase() as IntentKey;

      // Validate suggested intent (must be a known intent, not UNKNOWN/AMBIGUOUS)
      const validIntents: IntentKey[] = [
        'GREETING',
        'SEARCH_PRODUCT',
        'ADD_TO_CART',
        'VIEW_CART',
        'UPDATE_CART',
        'REMOVE_FROM_CART',
        'HELP',
        'CHECKOUT',
        'QUERY_FAQ',
        'HANDOFF',
      ];

      if (!validIntents.includes(suggestedIntent)) {
        this.logger.warn(`LLM intent assist: invalid intent suggested: ${suggestedIntent}`);
        return null;
      }

      // Reclassify with hint from LLM
      // For simplicity, assign MED confidence (LLM helped but not 100% certain)
      return {
        intent: suggestedIntent,
        confidence: 'MED',
        reason: `LLM intent assist suggested ${suggestedIntent}`,
        signals: ['llm_assist'],
        missingSlots: [],
      };
    } catch (error) {
      // REQ-12, AC-12: Graceful degradation
      this.logger.warn('LLM intent assist error', error);
      return null;
    }
  }

  /**
   * Build short prompt for LLM intent assist
   * Includes lastIntent context and few-shot examples
   */
  private buildIntentAssistPrompt(text: string, lastIntent?: IntentKey): string {
    const contextHint = lastIntent ? `Previous user action: ${lastIntent}\n` : '';

    return `${contextHint}Classify user message into one intent:
GREETING, SEARCH_PRODUCT, ADD_TO_CART, VIEW_CART, UPDATE_CART, REMOVE_FROM_CART, HELP, CHECKOUT, QUERY_FAQ, HANDOFF, UNKNOWN

Examples:
"eso me gusta" (after SEARCH_PRODUCT) → intent: ADD_TO_CART
"quiero 2" (after ADD_TO_CART) → intent: UPDATE_CART
"ok perfecto" (after VIEW_CART) → intent: CHECKOUT

User message: "${text}"
Your answer (one line):`;
  }

  /**
   * REQ-09: Get LLM summary flag status (for handoff summaries - future PR-08)
   */
  isLlmSummaryEnabled(): boolean {
    return this.llmSummaryEnabled;
  }
}
