/**
 * Generic playbook defaults (PR-11)
 * Used as fallback when merchant has no industry set
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const GenericPlaybookDefaults: PlaybookConfig = {
  industry: undefined as unknown as 'ropa' | 'belleza' | 'minimarket',
  llmPrompt: {
    tone: 'Amigable y profesional. Usa emojis con moderación',
    focusAreas: ['producto', 'cantidad', 'disponibilidad'],
    commonQuestions: ['¿Tienes X?', '¿Cuánto cuesta?', '¿Cuándo llega?', '¿Cómo compro?'],
    upsellStrategy: 'Sugerir productos relacionados basados en la búsqueda del cliente',
    emojiUsage: 'moderate',
  },
  checkoutQuestions: [],
  messages: {
    greeting: '¡Hola! 👋 Soy tu asistente de {merchant_name}. ¿En qué puedo ayudarte?',
    addToCartConfirm: '¡Listo! Agregado al carrito 🛒',
    noStock: 'Ese producto está agotado. ¿Te gustaría ver otras opciones?',
    upsellTemplate: 'También tenemos {product} que podría interesarte',
    checkoutStart: '¡Perfecto! Vamos a confirmar tu pedido',
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: false,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 3,
  },
};
