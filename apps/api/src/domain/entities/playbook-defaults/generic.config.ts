/**
 * Generic playbook defaults (PR-11 / PR-GAP-1)
 * Used as fallback when merchant has no industry set
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const GenericPlaybookDefaults: PlaybookConfig = {
  industry: undefined as unknown as 'ropa' | 'belleza' | 'minimarket',
  botPersonality: {
    style: 'friendly',
    emojiUsage: 'moderate',
  },
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
    addToCartConfirm:
      '¡Listo! Agregado al carrito 🛒\n\n📦 {product_name} - {variant_name}\n💰 ${price}\n\n🛒 Total: *${cart_total}* ({cart_item_count} {cart_item_word})\n\nEscribe "ver carrito" para revisar o "buscar" para agregar más.',
    noStock: 'Ese producto está agotado. ¿Te gustaría ver otras opciones?',
    upsellTemplate: 'También tenemos {product} que podría interesarte',
    checkoutStart: '¡Perfecto! Vamos a confirmar tu pedido',
    searchNoResults:
      '😔 No encontré productos para "{query}"\n\nIntenta con otras palabras o escribe "ayuda" para ver opciones.',
    searchResultsHeader: '🔍 Resultados para "{query}" ({count}):\n\n',
    searchResultsFooter: '\n\n💬 Para agregar al carrito, escribe el nombre del producto',
    helpMenu:
      '📋 *Opciones disponibles*\n\n🔍 *Buscar productos*\nSimplemente escribe lo que buscas\nEjemplo: "busco zapatillas", "tienes camisas azules"\n\n🛒 *Ver carrito*\nEscribe "ver carrito" o "carrito"\n\n❓ *Ayuda*\nEscribe "ayuda" o "menú" para ver estas opciones\n\n💬 *Hablar con un humano*\nEscribe "hablar con agente" o "ayuda humana"\n\n---\n\n¿En qué puedo ayudarte?',
    cartEmpty: '🛒 *Tu carrito está vacío*\n\nEscribe "buscar" para explorar productos.',
    cartSummaryHeader: '🛒 *Tu carrito* ({item_count} {item_word})\n\n',
    cartSummaryFooter:
      '\n\n💰 *Total: ${total}*\n\n✏️ Para modificar cantidades o remover items, escríbeme qué quieres cambiar.',
    removeConfirm: '✅ *{product_name} - {variant_name}* removido del carrito',
    updateConfirm: '✅ *Cantidad actualizada*\n\n{product_name}: {quantity} unidades',
    quantityInvalid: '❌ La cantidad debe estar entre 1 y 99 unidades.',
    productNotFound: '😔 No encontré "{query}"\n\nEscribe "buscar" para ver el catálogo.',
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
    orderStatusPendingPayment: 'está pendiente de pago.',
    orderStatusConfirmed: 'está confirmado y en preparación.',
    orderStatusPaid: 'está pagado y en preparación 📦',
    orderStatusShipped: 'fue enviado. {trackingInfo} 🚚',
    orderStatusDelivered: '¡ya fue entregado! 🎉',
    orderStatusCancelled: 'fue cancelado.',
    noOrderFound: 'No encontré pedidos tuyos. ¿Cuál es el código de tu pedido?',
    ticketTypePrompt:
      '¿Qué tipo de problema tienes?\n1) Falta algo\n2) Llegó dañado\n3) Se demoró\n4) Otro',
    ticketCreatedConfirm:
      '✅ Tu reclamo fue registrado. El merchant fue notificado y responderá pronto.',
    ticketDescriptionPrompt: 'Describe brevemente el problema:',
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: false,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 3,
  },
  // PR-GAP-2: FAQ presets genéricos (AC-04)
  faqs: [
    {
      question: '¿Cuánto demora el envío?',
      keywords: ['envio', 'demora'],
      answer: 'Los envíos demoran 3-5 días hábiles 📦',
    },
    {
      question: '¿Cómo puedo pagar?',
      keywords: ['pago', 'metodos'],
      answer: 'Aceptamos transferencia y pago contra entrega 💳',
    },
    {
      question: '¿Cuál es el horario de atención?',
      keywords: ['horario', 'abierto'],
      answer: 'Escribe "ayuda" para ver nuestras opciones 💬',
    },
    {
      question: '¿Cómo los contacto?',
      keywords: ['contacto', 'telefono', 'whatsapp'],
      answer: 'Estoy aquí para ayudarte. ¿Qué necesitas? 😊',
    },
    {
      question: '¿Qué opciones tienen?',
      keywords: ['ayuda', 'opciones'],
      answer: 'Escribe "ayuda" para ver el menú completo 📋',
    },
  ],
};
