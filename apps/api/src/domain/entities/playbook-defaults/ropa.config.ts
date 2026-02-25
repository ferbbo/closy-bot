/**
 * Playbook defaults for ROPA (Clothing) industry (PR-11 / PR-GAP-1)
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const RopaPlaybookDefaults: PlaybookConfig = {
  industry: 'ropa',
  botPersonality: {
    style: 'enthusiastic',
    emojiUsage: 'frequent',
    signatureEmoji: '👗',
  },
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
    addToCartConfirm:
      '¡Genial! Agregado al carrito 🛒\n\n👗 {product_name} - {variant_name}\n💰 ${price}\n\n🛒 Total: *${cart_total}* ({cart_item_count} {cart_item_word})\n\nEscribe "ver carrito" para revisar o "buscar" para agregar más.',
    noStock: 'Uy, ese modelo está agotado 😔. ¿Te notifico cuando llegue o vemos algo similar?',
    upsellTemplate: 'Este {product} combina perfecto con lo que elegiste ✨',
    checkoutStart: '¡Perfecto! Vamos a confirmar tu pedido 📦',
    searchNoResults:
      '😔 No encontré prendas para "{query}"\n\nIntenta con otras palabras o escribe "ayuda" para ver opciones.',
    searchResultsHeader: '🔍 Resultados para "{query}" ({count}):\n\n',
    searchResultsFooter: '\n\n💬 Para agregar al carrito, escribe el nombre de la prenda 👗',
    helpMenu:
      '📋 *Opciones disponibles*\n\n🔍 *Buscar prendas*\nEscribe lo que buscas: "camisas", "vestido azul", "talla M"\n\n🛒 *Ver carrito*\nEscribe "ver carrito" o "carrito"\n\n❓ *Ayuda*\nEscribe "ayuda" o "menú"\n\n💬 *Hablar con un humano*\nEscribe "hablar con agente" o "ayuda humana"\n\n---\n\n¿En qué puedo ayudarte? 👗',
    cartEmpty:
      '🛒 *Tu carrito está vacío*\n\nEscribe "buscar" para explorar nuestra ropa o dime qué estilo buscas.',
    cartSummaryHeader: '🛒 *Tu carrito* ({item_count} {item_word})\n\n',
    cartSummaryFooter: '\n\n💰 *Total: ${total}*\n\n✏️ Para modificar, dime qué quieres cambiar.',
    removeConfirm: '✅ *{product_name} - {variant_name}* removido del carrito 👗',
    updateConfirm: '✅ *Cantidad actualizada*\n\n{product_name}: {quantity} unidades',
    quantityInvalid: '❌ La cantidad debe estar entre 1 y 99 unidades.',
    productNotFound: '😔 No encontré "{query}"\n\nEscribe "buscar" para ver el catálogo 👗',
    productMultipleOptions:
      'Encontré varias opciones:\n\n{product_list}\n\n¿Cuál quieres agregar? Responde con el nombre exacto.',
    variantMultipleOptions:
      '*{product_name}* tiene varias opciones:\n\n{variant_list}\n\n¿Cuál variante quieres? Responde con el nombre.',
    itemNotInCart:
      'No encontré "{query}" en tu carrito.\n\nTu carrito tiene:\n{items_list}\n\n¿Cuál quieres modificar?',
    cartEmptyNoAction: '🛒 Tu carrito está vacío, no hay nada que {action}.',
    genericError: '❌ Error al {action}. Intenta de nuevo.',
    unknownIntent: 'No entendí tu mensaje. Escribe "ayuda" para ver opciones 👗',
    // ── PR-07: Post-sale templates ──────────────────────────────────────────
    orderStatusTemplate: 'Tu pedido {orderCode}: {statusMessage}',
    orderStatusPendingPayment: 'está pendiente de pago 💳',
    orderStatusConfirmed: 'está confirmado y en preparación 👗',
    orderStatusPaid: 'está pagado y en preparación 📦',
    orderStatusShipped: 'fue enviado. {trackingInfo} 🚚',
    orderStatusDelivered: '¡ya fue entregado! 🎉',
    orderStatusCancelled: 'fue cancelado.',
    noOrderFound: 'No encontré pedidos tuyos. ¿Cuál es el código de tu pedido? 👗',
    ticketTypePrompt:
      '¿Qué tipo de problema tienes?\n1) Falta algo\n2) Llegó dañado\n3) Se demoró\n4) Otro',
    ticketCreatedConfirm:
      '✅ Tu reclamo fue registrado. El merchant fue notificado y responderá pronto 👗',
    ticketDescriptionPrompt: 'Describe brevemente el problema:',
  },
  rules: {
    askSizeBeforeCart: true,
    askSkinTypeOnSearch: false,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 4,
  },
  cartConfig: {
    ttlHours: 24, // PR-04: Cart expires after 24 hours
  },
  // PR-GAP-2: FAQ presets para industria Ropa (AC-04)
  faqs: [
    {
      question: '¿Cuánto demora el envío?',
      keywords: ['envio', 'demora', 'llega'],
      answer: 'Los envíos demoran 3-5 días hábiles 📦',
    },
    {
      question: '¿Hacen cambios de talla?',
      keywords: ['cambio', 'devolver', 'talla'],
      answer: 'Aceptamos cambios hasta 15 días después de recibir tu pedido 👗',
    },
    {
      question: '¿Qué tallas tienen disponibles?',
      keywords: ['tallas', 'disponible', 'medidas'],
      answer: 'Contamos con tallas XS a XXL. ¿Qué talla buscas? 📏',
    },
    {
      question: '¿Cómo puedo pagar?',
      keywords: ['pago', 'transferencia', 'efectivo'],
      answer: 'Aceptamos transferencia y pago contra entrega 💳',
    },
    {
      question: '¿Cuándo reabastecen stock?',
      keywords: ['stock', 'reposicion', 'cuando llega'],
      answer: 'Si no hay stock, te podemos notificar cuando llegue ✨',
    },
  ],
};
