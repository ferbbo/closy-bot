import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import type { Faq, PlaybookConfig } from '../../domain/entities/playbook-config.interface';

/**
 * FaqFlow — PR-GAP-2
 * REQ-03: Keyword-based FAQ matching (no LLM, no embeddings).
 *
 * Algorithm:
 *  1. Resolve PlaybookConfig via PlaybookService (merchant override + industry defaults)
 *  2. Normalize query (lowercase + strip tildes)
 *  3. For each FAQ, count keywords that appear in normalized query (score)
 *  4. Return answer of FAQ with highest score if score >= threshold
 *  5. Return null if no FAQ meets threshold (fallback to orchestrator)
 *
 * Config:
 *  - FAQ_MATCH_THRESHOLD (env, default: 1) — minimum keyword matches to trigger answer
 */
@Injectable()
export class FaqFlow {
  private readonly logger = new Logger(FaqFlow.name);
  private readonly threshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly playbookService: PlaybookService,
  ) {
    this.threshold = this.configService.get<number>('FAQ_MATCH_THRESHOLD', 1);
    this.logger.log(`FaqFlow initialized — threshold=${this.threshold}`);
  }

  /**
   * REQ-03 AC-03: Handle FAQ query
   *
   * @param merchant - Merchant data (used to resolve PlaybookConfig + FAQs)
   * @param query    - Raw user message
   * @returns FAQ answer string if match >= threshold, null otherwise
   */
  handle(merchant: MerchantPlaybookData, query: string): string | null {
    const playbookConfig: PlaybookConfig = this.playbookService.getPlaybookForMerchant(merchant);
    const faqs: Faq[] = playbookConfig.faqs ?? [];

    // AC-03 edge case: empty FAQ array → null immediately
    if (faqs.length === 0) {
      this.logger.debug('FaqFlow: faqs array is empty, returning null');
      return null;
    }

    const normalized = this.normalizeText(query);
    this.logger.debug(`FaqFlow: normalized query="${normalized}"`);

    let bestFaq: Faq | null = null;
    let bestScore = 0;

    for (const faq of faqs) {
      const score = this.scoreFaq(faq, normalized);
      // AC-03, AC-09 (score empate): keep first FAQ (order matters)
      if (score > bestScore) {
        bestScore = score;
        bestFaq = faq;
      }
    }

    if (bestScore >= this.threshold && bestFaq !== null) {
      this.logger.debug(
        `FaqFlow: match found (score=${bestScore}) → "${bestFaq.question.slice(0, 40)}..."`,
      );
      return bestFaq.answer;
    }

    this.logger.debug(`FaqFlow: no match (bestScore=${bestScore} < threshold=${this.threshold})`);
    return null;
  }

  /**
   * AC-09: Normalize text — same algorithm as IntentRouterService.normalizeText()
   * Lowercase + remove accents/tildes + collapse spaces + trim
   */
  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * REQ-03: Scoring — count how many FAQ keywords appear in normalized query
   * score = faq.keywords.filter(kw => normalizedQuery.includes(normalizeText(kw))).length
   */
  private scoreFaq(faq: Faq, normalizedQuery: string): number {
    return faq.keywords.filter((kw) => normalizedQuery.includes(this.normalizeText(kw))).length;
  }
}
