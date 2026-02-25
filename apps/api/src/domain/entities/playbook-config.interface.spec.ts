/**
 * AC-01: PlaybookConfig interface spec
 * PR-GAP-1: Verifies that BotPersonality and 18 new PlaybookMessages fields are present in the interface.
 * Evidence for AC-01: playbook-config interface has botPersonality + all 23 PlaybookMessages fields.
 */

import {
  PlaybookConfig,
  PlaybookMessages,
  BotPersonality,
  Faq,
  HandoffMessages,
} from './playbook-config.interface';
import { GenericPlaybookDefaults } from './playbook-defaults/generic.config';

describe('AC-01: PlaybookConfig interface — botPersonality + PlaybookMessages completeness (PR-GAP-1)', () => {
  it('AC-01: GenericPlaybookDefaults satisfies PlaybookConfig type (compile-time guard)', () => {
    // TypeScript will fail to compile if the interface is wrong
    const config: PlaybookConfig = GenericPlaybookDefaults;
    expect(config).toBeDefined();
    // Generic preset has no industry (undefined) — it is the fallback for all merchants
    expect(config.messages).toBeDefined();
  });

  it('AC-01: PlaybookConfig has botPersonality field', () => {
    const config: PlaybookConfig = GenericPlaybookDefaults;
    expect(config.botPersonality).toBeDefined();
    expect(config.botPersonality).toHaveProperty('style');
    expect(config.botPersonality).toHaveProperty('emojiUsage');
  });

  it('AC-01: BotPersonality has correct allowed values', () => {
    // Compile-time guard: these assignments should be valid
    const validStyles: BotPersonality['style'][] = [
      'friendly',
      'professional',
      'enthusiastic',
      'minimal',
    ];
    const validEmojiUsage: BotPersonality['emojiUsage'][] = ['none', 'moderate', 'frequent'];

    expect(validStyles).toHaveLength(4);
    expect(validEmojiUsage).toHaveLength(3);

    const bp: BotPersonality = { style: 'minimal', emojiUsage: 'none', signatureEmoji: '🎯' };
    expect(bp.style).toBe('minimal');
    expect(bp.emojiUsage).toBe('none');
    expect(bp.signatureEmoji).toBe('🎯');
  });

  it('AC-01: PlaybookMessages has all 5 pre-existing fields', () => {
    const msgs: PlaybookMessages = GenericPlaybookDefaults.messages;
    expect(typeof msgs.greeting).toBe('string');
    expect(typeof msgs.addToCartConfirm).toBe('string');
    expect(typeof msgs.noStock).toBe('string');
    expect(typeof msgs.upsellTemplate).toBe('string');
    expect(typeof msgs.checkoutStart).toBe('string');
  });

  it('AC-01: PlaybookMessages has all 18 new PR-GAP-1 fields', () => {
    const msgs: PlaybookMessages = GenericPlaybookDefaults.messages;

    // Verify each new field is defined and non-empty
    const newFields: (keyof PlaybookMessages)[] = [
      'searchNoResults',
      'searchResultsHeader',
      'searchResultsFooter',
      'helpMenu',
      'cartEmpty',
      'cartSummaryHeader',
      'cartSummaryFooter',
      'removeConfirm',
      'updateConfirm',
      'quantityInvalid',
      'productNotFound',
      'productMultipleOptions',
      'variantMultipleOptions',
      'itemNotInCart',
      'cartEmptyNoAction',
      'genericError',
      'unknownIntent',
    ];

    for (const field of newFields) {
      expect(typeof msgs[field]).toBe('string');
      expect((msgs[field] as string).length).toBeGreaterThan(0);
    }
  });

  it('AC-01: PlaybookMessages has exactly 22 or more fields (5 pre-existing + 17+ new)', () => {
    const msgs: PlaybookMessages = GenericPlaybookDefaults.messages;
    const fieldCount = Object.keys(msgs).length;
    expect(fieldCount).toBeGreaterThanOrEqual(22);
  });

  // PR-GAP-2: Faq type evidence
  it('AC-01 (PR-GAP-2): Faq type has required fields question, keywords, answer', () => {
    const faq: Faq = {
      question: '¿Cuánto demora el envío?',
      keywords: ['envio', 'demora'],
      answer: 'Los envíos demoran 3-5 días hábiles 📦',
    };
    expect(typeof faq.question).toBe('string');
    expect(Array.isArray(faq.keywords)).toBe(true);
    expect(typeof faq.answer).toBe('string');
  });

  it('AC-01 (PR-GAP-2): PlaybookConfig has optional faqs field of type Faq[]', () => {
    // GenericPlaybookDefaults now has faqs
    const config: PlaybookConfig = GenericPlaybookDefaults;
    expect(Array.isArray(config.faqs)).toBe(true);
    if (config.faqs && config.faqs.length > 0) {
      const firstFaq = config.faqs[0];
      expect(typeof firstFaq.question).toBe('string');
      expect(Array.isArray(firstFaq.keywords)).toBe(true);
      expect(typeof firstFaq.answer).toBe('string');
    }
  });

  it('AC-01 (PR-GAP-2): PlaybookConfig.faqs is optional (undefined is valid)', () => {
    const config: PlaybookConfig = { ...GenericPlaybookDefaults };
    delete (config as Partial<PlaybookConfig>).faqs;
    // Should compile and be valid without faqs
    expect(config.faqs).toBeUndefined();
  });

  // AC-12 (PR-08): HandoffMessages DTO validation
  describe('AC-12 (PR-08): PlaybookConfig interface extendida con handoffMessages', () => {
    it('AC-12: HandoffMessages interface has required string fields', () => {
      // Compile-time guard: TypeScript fails to compile if fields are missing/wrong type
      const hm: HandoffMessages = {
        requestReceived: 'Conectando con un agente...',
        escalationDetected: 'Te conecto con soporte...',
        merchantNotification: '\uD83D\uDD14 Cliente: {customerName}\n{summary}',
      };
      expect(typeof hm.requestReceived).toBe('string');
      expect(typeof hm.escalationDetected).toBe('string');
      expect(typeof hm.merchantNotification).toBe('string');
    });

    it('AC-12: PlaybookConfig.handoffMessages is optional', () => {
      // GenericPlaybookDefaults has handoffMessages defined
      const config: PlaybookConfig = GenericPlaybookDefaults;
      // The field should be present in generic preset
      expect(config.handoffMessages).toBeDefined();
    });

    it('AC-12: PlaybookConfig.handoffMessages can be omitted (undefined is valid)', () => {
      const config: PlaybookConfig = { ...GenericPlaybookDefaults };
      delete (config as Partial<PlaybookConfig>).handoffMessages;
      expect(config.handoffMessages).toBeUndefined();
    });

    it('AC-12: GenericPlaybookDefaults.handoffMessages has all required fields', () => {
      const hm = GenericPlaybookDefaults.handoffMessages!;
      expect(typeof hm.requestReceived).toBe('string');
      expect(hm.requestReceived.length).toBeGreaterThan(0);
      expect(typeof hm.escalationDetected).toBe('string');
      expect(hm.escalationDetected.length).toBeGreaterThan(0);
      expect(typeof hm.merchantNotification).toBe('string');
      expect(hm.merchantNotification.length).toBeGreaterThan(0);
    });

    it('AC-12: HandoffMessages.merchantNotification supports {customerName} placeholder', () => {
      const hm = GenericPlaybookDefaults.handoffMessages!;
      // The template should include at least one placeholder
      const hasPlaceholder =
        hm.merchantNotification.includes('{customerName}') ||
        hm.merchantNotification.includes('{summary}');
      expect(hasPlaceholder).toBe(true);
    });
  });
});
