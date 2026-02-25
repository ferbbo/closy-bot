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
    addToCartConfirm:
      'Listo! Agregado a tu carrito 🛒\n\n📦 {product_name} - {variant_name}\n💰 ${price}\n\n🛒 Total: *${cart_total}* ({cart_item_count} {cart_item_word})\n\nEscribe "ver carrito" para revisar o "buscar" para agregar más.',
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
    // ── PR-07: Post-sale templates ──────────────────────────────────────────
    orderStatusTemplate: 'Tu pedido {orderCode}: {statusMessage}',
    orderStatusPendingPayment: 'está pendiente de pago 💳',
    orderStatusConfirmed: 'está confirmado y en preparación 🛒',
    orderStatusPaid: 'está pagado y en preparación 📦',
    orderStatusShipped: 'fue enviado. {trackingInfo} 🚚',
    orderStatusDelivered: '¡ya fue entregado! 🎉',
    orderStatusCancelled: 'fue cancelado.',
    noOrderFound: 'No encontré pedidos tuyos. ¿Cuál es el código de tu pedido? 🛒',
    ticketTypePrompt:
      '¿Qué tipo de problema tienes?\n1) Falta algo\n2) Llegó dañado\n3) Se demoró\n4) Otro',
    ticketCreatedConfirm:
      '✅ Tu reclamo fue registrado. El merchant fue notificado y responderá pronto.',
    ticketDescriptionPrompt: 'Describe brevemente el problema:',
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
  // PR-GAP-2: FAQ presets para industria Minimarket (AC-04)
  faqs: [
    {
      question: '¿Cuánto demora el delivery?',
      keywords: ['delivery', 'envio', 'demora'],
      answer: 'Delivery en 2-4 horas en zona urbana 🛒',
    },
    {
      question: '¿Cuál es el horario de atención?',
      keywords: ['horario', 'abierto', 'atienden'],
      answer: 'Atendemos de 8am a 10pm todos los días 🕐',
    },
    {
      question: '¿Hay mínimo de compra?',
      keywords: ['minimo', 'compra', 'pedido'],
      answer: 'Pedido mínimo: $15.000 para delivery 💰',
    },
    {
      question: '¿Cómo puedo pagar?',
      keywords: ['pago', 'transferencia', 'efectivo'],
      answer: 'Solo efectivo contra entrega 💵',
    },
    {
      question: '¿Aceptan devoluciones?',
      keywords: ['devolver', 'cambio', 'producto'],
      answer: 'No aceptamos devoluciones en alimentos. Solo productos defectuosos 🚫',
    },
  ],
};
