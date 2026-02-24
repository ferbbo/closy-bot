import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IntentKey,
  IntentDecision,
  IntentContext,
  ConfidenceLevel,
} from '../types/intent.types';
import { INTENT_KEYWORDS, CONTEXT_BONUSES, type KeywordConfig } from './keyword-configs';

/**
 * IntentRouterService V2
 * PR-03.5.1: Template-first keyword-based intent classification
 * with scoring, normalization, confidence levels, and context-aware routing.
 *
 * Changes from V1:
 * - REQ-01: Text normalization (lowercase, remove accents, collapse spaces)
 * - REQ-02: Keyword scoring with weights (not cascade)
 * - REQ-03: Confidence levels (HIGH/MED/LOW) based on score thresholds
 * - REQ-04: Context-aware routing (uses lastIntent for scoring bonuses)
 * - REQ-05: AMBIGUOUS intent when multiple intents with similar scores
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);
  private readonly thresholdHigh: number;
  private readonly thresholdLow: number;
  private readonly ambiguousThreshold: number = 2; // Score diff for collision detection

  constructor(private readonly configService: ConfigService) {
    // REQ-09: Load confidence thresholds from config
    this.thresholdHigh = this.configService.get<number>('INTENT_CONFIDENCE_THRESHOLD_HIGH', 5);
    this.thresholdLow = this.configService.get<number>('INTENT_CONFIDENCE_THRESHOLD_LOW', 2);
  }

  /**
   * REQ-01, AC-01: Normalize text for consistent matching
   * - Lowercase
   * - Remove accents/tildes
   * - Collapse multiple spaces into one
   * - Trim whitespace
   *
   * @example normalizeText("Búsco camisetas  ") => "busco camisetas"
   */
  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD') // Decompose accents
      .replace(/[\u0300-\u036f]/g, '') // Remove accent marks
      .replace(/\s+/g, ' ') // Collapse spaces
      .trim();
  }

  /**
   * REQ-02, AC-02: Score intent based on keyword matches with weights
   * Compound phrases (e.g., "quiero comprar") score higher than single words (e.g., "quiero")
   *
   * @param text - Normalized text
   * @param keywords - Keyword configurations with weights
   * @returns Total score for this intent
   */
  scoreIntent(text: string, keywords: KeywordConfig[]): number {
    let score = 0;
    const matched: string[] = [];

    for (const { phrase, weight } of keywords) {
      if (text.includes(phrase)) {
        score += weight;
        matched.push(phrase);
      }
    }

    if (matched.length > 0) {
      this.logger.debug(`Matched keywords: [${matched.join(', ')}] → score ${score}`);
    }

    return score;
  }

  /**
   * REQ-05, AC-05: Resolve collisions when multiple intents have similar scores
   * If top 2 intents have score diff < ambiguousThreshold, mark as AMBIGUOUS
   *
   * @param scores - Map of intent -> score
   * @returns IntentDecision with selected intent or AMBIGUOUS
   */
  resolveCollisions(scores: Map<IntentKey, number>): IntentDecision {
    const sorted = Array.from(scores.entries())
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]); // Descending by score

    if (sorted.length === 0) {
      return {
        intent: 'UNKNOWN',
        confidence: 'LOW',
        reason: 'No keywords matched',
        signals: [],
        missingSlots: [],
      };
    }

    const [topIntent, topScore] = sorted[0];

    // REQ-05, AC-05: Check for collision (top 2 intents with similar scores)
    if (sorted.length > 1) {
      const [secondIntent, secondScore] = sorted[1];
      const diff = topScore - secondScore;

      if (diff < this.ambiguousThreshold) {
        this.logger.debug(
          `Collision detected: ${topIntent}=${topScore} vs ${secondIntent}=${secondScore} (diff=${diff})`,
        );
        return {
          intent: 'AMBIGUOUS',
          confidence: 'LOW',
          reason: `Multiple intents matched: ${topIntent}=${topScore}, ${secondIntent}=${secondScore}`,
          signals: [topIntent, secondIntent],
          missingSlots: ['clarification'],
        };
      }
    }

    // REQ-03, AC-03: Calculate confidence level based on score
    const confidence = this.calculateConfidence(topScore);

    return {
      intent: topIntent,
      confidence,
      reason: `Matched keywords with score ${topScore}`,
      signals: [`score:${topScore}`],
      missingSlots: [],
    };
  }

  /**
   * REQ-03, AC-03: Calculate confidence level from score
   * - HIGH: score >= thresholdHigh
   * - MED: score >= thresholdLow
   * - LOW: score < thresholdLow
   */
  private calculateConfidence(score: number): ConfidenceLevel {
    if (score >= this.thresholdHigh) {
      return 'HIGH';
    } else if (score >= this.thresholdLow) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * REQ-04, AC-04: Apply context bonuses to scores based on lastIntent
   * Example: lastIntent=SEARCH_PRODUCT + current="quiero" → boost ADD_TO_CART score
   *
   * @param scores - Base scores from keyword matching
   * @param context - Intent context with lastIntent
   * @returns Adjusted scores with context bonuses
   */
  private applyContextBonuses(
    scores: Map<IntentKey, number>,
    context?: IntentContext,
  ): Map<IntentKey, number> {
    if (!context?.lastIntent) {
      return scores;
    }

    const bonuses = CONTEXT_BONUSES[context.lastIntent];
    if (!bonuses) {
      return scores;
    }

    const adjustedScores = new Map(scores);

    for (const [intent, bonus] of Object.entries(bonuses)) {
      const currentScore = adjustedScores.get(intent as IntentKey) || 0;
      const newScore = currentScore + bonus;
      adjustedScores.set(intent as IntentKey, newScore);

      if (bonus > 0) {
        this.logger.debug(
          `Context bonus: lastIntent=${context.lastIntent} → ${intent} +${bonus} (${currentScore} → ${newScore})`,
        );
      }
    }

    return adjustedScores;
  }

  /**
   * REQ-01 to REQ-05: Main classification method
   * Classifies user message using keyword scoring with normalization and context
   *
   * @param text - User message text
   * @param context - Optional context (lastIntent for context-aware routing)
   * @returns IntentDecision with intent, confidence, reason, signals, and missing slots
   */
  classify(text: string, context?: IntentContext): IntentDecision {
    const startTime = Date.now();

    // REQ-01, AC-01: Normalize text
    const normalized = this.normalizeText(text);
    this.logger.debug(`Normalized: "${text}" → "${normalized}"`);

    // REQ-02, AC-02: Score all intents
    const scores = new Map<IntentKey, number>();

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      const score = this.scoreIntent(normalized, keywords);
      scores.set(intent as IntentKey, score);
    }

    // REQ-04, AC-04: Apply context bonuses
    const adjustedScores = this.applyContextBonuses(scores, context);

    // REQ-05, AC-05: Resolve collisions and select intent
    const decision = this.resolveCollisions(adjustedScores);

    const latencyMs = Date.now() - startTime;
    this.logger.log(
      `Intent: ${decision.intent} | Confidence: ${decision.confidence} | Latency: ${latencyMs}ms`,
    );

    return decision;
  }
}
