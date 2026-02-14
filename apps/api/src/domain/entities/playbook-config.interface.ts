/**
 * PlaybookConfig Interface (PR-11)
 * Central config structure for industry playbooks
 * Defines behavior, prompts, and rules per industry
 */

export type Industry = 'ropa' | 'belleza' | 'minimarket';

export interface PlaybookConfig {
  industry: Industry;
  llmPrompt: LlmPromptConfig;
  checkoutQuestions: CheckoutQuestion[];
  messages: PlaybookMessages;
  rules: PlaybookRules;
}

export interface LlmPromptConfig {
  /** Tone and personality instructions for LLM */
  tone: string;
  /** Key aspects to ask about (size, color, skin type, etc.) */
  focusAreas: string[];
  /** Predefined FAQ topics */
  commonQuestions: string[];
  /** How to suggest additional products */
  upsellStrategy: string;
  /** Emoji usage level */
  emojiUsage: 'none' | 'moderate' | 'frequent';
}

export interface CheckoutQuestion {
  /** Unique key for the question (e.g., "size", "skin_type") */
  key: string;
  /** Display label for the user */
  label: string;
  /** Question type */
  type: 'text' | 'choice' | 'boolean';
  /** Whether this question is required */
  required: boolean;
  /** Options for choice type */
  options?: string[];
  /** Default value */
  default?: string;
}

export interface PlaybookMessages {
  /** Initial greeting message */
  greeting: string;
  /** Confirmation message when item added to cart */
  addToCartConfirm: string;
  /** Message when product is out of stock */
  noStock: string;
  /** Template for upsell suggestions (use {product} placeholder) */
  upsellTemplate: string;
  /** Message when starting checkout */
  checkoutStart: string;
}

export interface PlaybookRules {
  /** Ask for size before adding to cart (Ropa) */
  askSizeBeforeCart: boolean;
  /** Ask skin type during product search (Belleza) */
  askSkinTypeOnSearch: boolean;
  /** Offer automatic substitutions for out-of-stock items (Minimarket) */
  autoSubstitutions: boolean;
  /** Enable upsell suggestions */
  upsellEnabled: boolean;
  /** Max number of product recommendations */
  maxRecommendations: number;
}
