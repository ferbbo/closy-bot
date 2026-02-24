/**
 * Playbook defaults for BELLEZA (Beauty/Cosmetics) industry (PR-11)
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const BellezaPlaybookDefaults: PlaybookConfig = {
  industry: 'belleza',
  llmPrompt: {
    tone: 'Profesional pero cercano, empático. Usa emojis de belleza ✨💄💅',
    focusAreas: ['tipo de piel', 'preocupaciones', 'alergias', 'preferencias'],
    commonQuestions: [
      '¿Es para piel seca/grasa/mixta?',
      '¿Tienes alergias?',
      '¿Probado antes?',
      '¿Cuánto dura?',
    ],
    upsellStrategy: 'Ofrecer rutina completa: limpiador + tratamiento + hidratante',
    emojiUsage: 'moderate',
  },
  checkoutQuestions: [
    {
      key: 'skin_type',
      label: '¿Qué tipo de piel tienes?',
      type: 'choice',
      required: false,
      options: ['Seca', 'Grasa', 'Mixta', 'Sensible', 'Normal'],
      default: 'Normal',
    },
    {
      key: 'allergies',
      label: '¿Tienes alguna alergia o sensibilidad?',
      type: 'text',
      required: false,
    },
  ],
  messages: {
    greeting: '¡Hola! ✨ Soy tu asistente de {merchant_name}. ¿Qué producto de belleza necesitas?',
    addToCartConfirm: 'Perfecto! Agregado a tu carrito 💄',
    noStock: 'Ese producto está agotado temporalmente. Puedo recomendarte una alternativa similar?',
    upsellTemplate: 'Para complementar, te recomiendo {product} ✨',
    checkoutStart: '¡Excelente elección! Confirmemos tu pedido 📦',
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: true,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 3,
  },
  cartConfig: {
    ttlHours: 24, // PR-04: Cart expires after 24 hours
  },
};
