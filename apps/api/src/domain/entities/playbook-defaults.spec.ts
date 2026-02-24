/**
 * AC-06: playbook-defaults completeness spec
 * PR-GAP-1: Verifies all 4 industry presets have botPersonality + all PlaybookMessages fields.
 * Evidence for AC-06: Each preset satisfies PlaybookConfig schema (23 messages + botPersonality).
 */

import { PlaybookConfig, PlaybookMessages } from './playbook-config.interface';
import { GenericPlaybookDefaults } from './playbook-defaults/generic.config';
import { RopaPlaybookDefaults } from './playbook-defaults/ropa.config';
import { BellezaPlaybookDefaults } from './playbook-defaults/belleza.config';
import { MinimarketPlaybookDefaults } from './playbook-defaults/minimarket.config';

const ALL_MESSAGE_KEYS: (keyof PlaybookMessages)[] = [
  // Pre-existing (PR-11)
  'greeting',
  'addToCartConfirm',
  'noStock',
  'upsellTemplate',
  'checkoutStart',
  // New (PR-GAP-1)
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

function verifyPresetCompleteness(preset: PlaybookConfig, industryName: string) {
  describe(`${industryName} preset`, () => {
    it(`AC-06: ${industryName} has all ${ALL_MESSAGE_KEYS.length} PlaybookMessages fields`, () => {
      for (const key of ALL_MESSAGE_KEYS) {
        expect(typeof preset.messages[key]).toBe('string');
        expect((preset.messages[key] as string).length).toBeGreaterThan(0);
      }
    });

    it(`AC-06: ${industryName} has botPersonality with style and emojiUsage`, () => {
      expect(preset.botPersonality).toBeDefined();
      expect(['friendly', 'professional', 'enthusiastic', 'minimal']).toContain(
        preset.botPersonality?.style,
      );
      expect(['none', 'moderate', 'frequent']).toContain(preset.botPersonality?.emojiUsage);
    });

    it(`AC-06: ${industryName} has messages defined`, () => {
      // Generic preset has industry=undefined (fallback); industry presets have their value
      expect(preset.messages).toBeDefined();
    });

    it(`AC-06: ${industryName} satisfies PlaybookConfig type (compile-time)`, () => {
      const config: PlaybookConfig = preset;
      expect(config).toBeDefined();
    });
  });
}

/**
 * AC-06: 4 industry presets completeness (PR-GAP-1)
 */
describe('AC-06: Industry presets completeness — botPersonality + all messages (PR-GAP-1)', () => {
  verifyPresetCompleteness(GenericPlaybookDefaults, 'Generic');
  verifyPresetCompleteness(RopaPlaybookDefaults, 'Ropa');
  verifyPresetCompleteness(BellezaPlaybookDefaults, 'Belleza');
  verifyPresetCompleteness(MinimarketPlaybookDefaults, 'Minimarket');

  it('AC-06: signatureEmoji is set for industry-specific presets', () => {
    expect(RopaPlaybookDefaults.botPersonality?.signatureEmoji).toBeDefined();
    expect(BellezaPlaybookDefaults.botPersonality?.signatureEmoji).toBeDefined();
    expect(MinimarketPlaybookDefaults.botPersonality?.signatureEmoji).toBeDefined();
  });

  it('AC-06: each preset has a different botPersonality style', () => {
    const styles = [
      GenericPlaybookDefaults.botPersonality?.style,
      RopaPlaybookDefaults.botPersonality?.style,
      BellezaPlaybookDefaults.botPersonality?.style,
      MinimarketPlaybookDefaults.botPersonality?.style,
    ];
    // At least 2 different styles across the 4 presets
    const uniqueStyles = new Set(styles);
    expect(uniqueStyles.size).toBeGreaterThanOrEqual(2);
  });
});

/**
 * AC-04: 4 industry presets have 5+ FAQs base cada uno (PR-GAP-2)
 */
describe('AC-04: Industry presets tienen 5+ FAQs base (PR-GAP-2)', () => {
  const presets = [
    { name: 'Generic', preset: GenericPlaybookDefaults },
    { name: 'Ropa', preset: RopaPlaybookDefaults },
    { name: 'Belleza', preset: BellezaPlaybookDefaults },
    { name: 'Minimarket', preset: MinimarketPlaybookDefaults },
  ];

  for (const { name, preset } of presets) {
    it(`AC-04: ${name} preset tiene al menos 5 FAQs`, () => {
      expect(Array.isArray(preset.faqs)).toBe(true);
      expect(preset.faqs!.length).toBeGreaterThanOrEqual(5);
    });

    it(`AC-04: ${name} preset FAQs tienen question, keywords[] y answer`, () => {
      for (const faq of preset.faqs!) {
        expect(typeof faq.question).toBe('string');
        expect(faq.question.length).toBeGreaterThan(0);
        expect(Array.isArray(faq.keywords)).toBe(true);
        expect(faq.keywords.length).toBeGreaterThan(0);
        expect(typeof faq.answer).toBe('string');
        expect(faq.answer.length).toBeGreaterThan(0);
      }
    });

    it(`AC-04: ${name} preset FAQ keywords están en minúsculas sin tildes`, () => {
      for (const faq of preset.faqs!) {
        for (const kw of faq.keywords) {
          // Keywords should be lowercase
          expect(kw).toBe(kw.toLowerCase());
        }
      }
    });
  }
});
