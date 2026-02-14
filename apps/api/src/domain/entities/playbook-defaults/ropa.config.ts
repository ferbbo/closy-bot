/**
 * Playbook defaults for ROPA (Clothing) industry (PR-11)
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const RopaPlaybookDefaults: PlaybookConfig = {
  industry: 'ropa',
  llmPrompt: {
    tone: 'Conversacional, moderno, entusiasta. Usa emojis de moda 👗👕✨',
    focusAreas: ['talla', 'color', 'estilo', 'ocasión'],
    commonQuestions: [
      '¿Tienes en otra talla?',
      '¿Qué colores disponibles?',
      '¿Cuándo llega?',
      'Políticas de cambio',
    ],
    upsellStrategy: 'Sugerir complementos: cinturón con pantalón, bolso con vestido',
    emojiUsage: 'frequent',
  },
  checkoutQuestions: [
    {
      key: 'size',
      label: '¿Qué talla necesitas?',
      type: 'choice',
      required: true,
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    },
    {
      key: 'color',
      label: '¿Qué color prefieres?',
      type: 'text',
      required: false,
    },
  ],
  messages: {
    greeting: '¡Hola! 👗 Soy tu asistente de {merchant_name}. ¿Qué estilo buscas hoy?',
    addToCartConfirm: '¡Genial! Agregado al carrito 🛒',
    noStock:
      'Uy, ese modelo está agotado 😔. Te puedo notificar cuando llegue o mostrarte algo similar?',
    upsellTemplate: 'Este {product} combina perfecto con lo que elegiste ✨',
    checkoutStart: '¡Perfecto! Vamos a confirmar tu pedido 📦',
  },
  rules: {
    askSizeBeforeCart: true,
    askSkinTypeOnSearch: false,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 4,
  },
};
