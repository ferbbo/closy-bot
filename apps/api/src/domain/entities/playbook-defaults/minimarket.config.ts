/**
 * Playbook defaults for MINIMARKET (Convenience store) industry (PR-11 / PR-GAP-1)
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const MinimarketPlaybookDefaults: PlaybookConfig = {
  industry: 'minimarket',
  botPersonality: {
    style: 'professional',
    emojiUsage: 'moderate',
    signatureEmoji: '🛒',
  },
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
    noStock: 'Ese producto está agotado. ¿Puedo sugerirte algo similar o lo quito del pedido?',
    upsellTemplate: 'También tenemos {product}, ¿te podría servir?',
    checkoutStart: 'Perfecto! Vamos a confirmar tu pedido 📦',
    searchNoResults:
      '😔 No encontré productos para "{query}"\n\nIntenta con otras palabras o escribe "ayuda" para ver opciones.',
    searchResultsHeader: '🔍 Resultados para "{query}" ({count}):\n\n',
    searchResultsFooter: '\n\n💬 Para agregar al carrito, escribe el nombre del producto 🛒',
    helpMenu:
      '📋 *Opciones disponibles*\n\n🔍 *Buscar productos*\nEscribe lo que buscas: "leche", "papel higiénico"\n\n🛒 *Ver carrito*\nEscribe "ver carrito" o "carrito"\n\n❓ *Ayuda*\nEscribe "ayuda" o "menú"\n\n💬 *Hablar con un humano*\nEscribe "hablar con agente" o "ayuda humana"\n\n---\n\n¿En qué puedo ayudarte? 🛒',
    cartEmpty:
      '🛒 *Tu carrito está vacío*\n\nEscribe "buscar" para explorar productos o dime qué necesitas.',
    cartSummaryHeader: '🛒 *Tu carrito* ({item_count} {item_word})\n\n',
    cartSummaryFooter: '\n\n💰 *Total: ${total}*\n\n✏️ Para modificar, dime qué quieres cambiar.',
    removeConfirm: '✅ *{product_name} - {variant_name}* removido del carrito',
    updateConfirm: '✅ *Cantidad actualizada*\n\n{product_name}: {quantity} unidades',
    quantityInvalid: '❌ La cantidad debe estar entre 1 y 99 unidades.',
    productNotFound: '😔 No encontré "{query}"\n\nEscribe "buscar" para ver el catálogo 🛒',
    productMultipleOptions:
      'Encontré varias opciones:\n\n{product_list}\n\n¿Cuál quieres agregar? Responde con el nombre exacto.',
    variantMultipleOptions:
      '*{product_name}* tiene varias opciones:\n\n{variant_list}\n\n¿Cuál variante quieres? Responde con el nombre.',
    itemNotInCart:
      'No encontré "{query}" en tu carrito.\n\nTu carrito tiene:\n{items_list}\n\n¿Cuál quieres modificar?',
    cartEmptyNoAction: '🛒 Tu carrito está vacío, no hay nada que {action}.',
    genericError: '❌ Error al {action}. Intenta de nuevo.',
    unknownIntent: 'No entendí tu mensaje. Escribe "ayuda" para ver opciones.',
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: false,
    autoSubstitutions: true,
    upsellEnabled: true,
    maxRecommendations: 5,
  },
  cartConfig: {
    ttlHours: 24, // PR-04: Cart expires after 24 hours
  },
};
