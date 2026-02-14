/**
 * Playbook defaults for MINIMARKET (Convenience store) industry (PR-11)
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const MinimarketPlaybookDefaults: PlaybookConfig = {
  industry: 'minimarket',
  llmPrompt: {
    tone: 'Práctico, eficiente, amigable. Emojis básicos 🛒📦',
    focusAreas: ['categoría', 'cantidad', 'sustituciones', 'urgencia'],
    commonQuestions: [
      '¿Tienes X producto?',
      '¿Entregan hoy?',
      '¿Aceptan sustituciones?',
      'Mínimo de compra?',
    ],
    upsellStrategy: 'Recordar productos relacionados: pan con mermelada, café con leche',
    emojiUsage: 'moderate',
  },
  checkoutQuestions: [
    {
      key: 'substitution_ok',
      label: 'Si algo no hay, ¿te parece bien que lo sustituyamos por similar?',
      type: 'boolean',
      required: true,
      default: 'true',
    },
  ],
  messages: {
    greeting: '¡Hola! 🛒 Soy tu asistente de {merchant_name}. ¿Qué necesitas para tu hogar?',
    addToCartConfirm: 'Listo! Agregado a tu carrito 🛒',
    noStock: 'Ese producto está agotado. Puedo sugerirte algo similar o lo quito del pedido?',
    upsellTemplate: 'También tenemos {product}, te podría servir?',
    checkoutStart: 'Perfecto! Vamos a confirmar tu pedido 📦',
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: false,
    autoSubstitutions: true,
    upsellEnabled: true,
    maxRecommendations: 5,
  },
};
