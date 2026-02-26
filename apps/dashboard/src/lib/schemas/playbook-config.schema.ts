/**
 * Zod schemas for Playbook Settings forms
 * PR-FE-05: client-side validation
 * Note: zod v4 compatible
 */
import { z } from 'zod';

// ── Messages ─────────────────────────────────────────────────────────────────

export const playbookMessagesSchema = z.object({
  greeting: z.string().min(1, 'Requerido').max(500),
  addToCartConfirm: z.string().min(1, 'Requerido').max(300),
  noStock: z.string().min(1, 'Requerido').max(300),
  upsellTemplate: z.string().min(1, 'Requerido').max(300),
  checkoutStart: z.string().min(1, 'Requerido').max(300),
  searchNoResults: z.string().min(1, 'Requerido').max(300),
  searchResultsHeader: z.string().min(1, 'Requerido').max(300),
  searchResultsFooter: z.string().min(1, 'Requerido').max(300),
  helpMenu: z.string().min(1, 'Requerido').max(500),
  cartEmpty: z.string().min(1, 'Requerido').max(300),
  cartSummaryHeader: z.string().min(1, 'Requerido').max(300),
  cartSummaryFooter: z.string().min(1, 'Requerido').max(300),
  removeConfirm: z.string().min(1, 'Requerido').max(300),
  updateConfirm: z.string().min(1, 'Requerido').max(300),
  quantityInvalid: z.string().min(1, 'Requerido').max(300),
  productNotFound: z.string().min(1, 'Requerido').max(300),
  productMultipleOptions: z.string().min(1, 'Requerido').max(300),
  variantMultipleOptions: z.string().min(1, 'Requerido').max(300),
  itemNotInCart: z.string().min(1, 'Requerido').max(300),
  cartEmptyNoAction: z.string().min(1, 'Requerido').max(300),
  genericError: z.string().min(1, 'Requerido').max(300),
  unknownIntent: z.string().min(1, 'Requerido').max(300),
  orderStatusTemplate: z.string().min(1, 'Requerido').max(300),
  orderStatusPendingPayment: z.string().min(1, 'Requerido').max(300),
  orderStatusConfirmed: z.string().min(1, 'Requerido').max(300),
  orderStatusPaid: z.string().min(1, 'Requerido').max(300),
  orderStatusShipped: z.string().min(1, 'Requerido').max(300),
  orderStatusDelivered: z.string().min(1, 'Requerido').max(300),
  orderStatusCancelled: z.string().min(1, 'Requerido').max(300),
  noOrderFound: z.string().min(1, 'Requerido').max(300),
  ticketTypePrompt: z.string().min(1, 'Requerido').max(300),
  ticketCreatedConfirm: z.string().min(1, 'Requerido').max(300),
  ticketDescriptionPrompt: z.string().min(1, 'Requerido').max(300),
});

export type PlaybookMessagesFormValues = z.infer<typeof playbookMessagesSchema>;

// ── Rules ─────────────────────────────────────────────────────────────────────

export const playbookRulesSchema = z.object({
  askSizeBeforeCart: z.boolean(),
  askSkinTypeOnSearch: z.boolean(),
  autoSubstitutions: z.boolean(),
  upsellEnabled: z.boolean(),
  maxRecommendations: z
    .number()
    .int('Debe ser entero')
    .min(1, 'Mínimo 1')
    .max(10, 'Máximo 10'),
});

export type PlaybookRulesFormValues = z.infer<typeof playbookRulesSchema>;

// ── Guidelines (LlmPromptConfig) ─────────────────────────────────────────────

export const llmPromptConfigSchema = z.object({
  tone: z
    .string()
    .min(10, 'El tono debe tener al menos 10 caracteres')
    .max(1000),
  focusAreas: z
    .array(z.string().min(1))
    .min(1, 'Agrega al menos 1 área de enfoque'),
  commonQuestions: z
    .array(z.string().min(1))
    .min(1, 'Agrega al menos 1 pregunta común'),
  upsellStrategy: z
    .string()
    .min(10, 'La estrategia debe tener al menos 10 caracteres')
    .max(1000),
  emojiUsage: z.enum(['none', 'moderate', 'frequent']),
});

export type LlmPromptConfigFormValues = z.infer<typeof llmPromptConfigSchema>;

// ── Merchant Profile ──────────────────────────────────────────────────────────

export const merchantProfileSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
});

export type MerchantProfileFormValues = z.infer<typeof merchantProfileSchema>;
