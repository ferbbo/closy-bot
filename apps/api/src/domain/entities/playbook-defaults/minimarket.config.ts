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
    // ── PR-04.0: Search + Cart management ────────────────────────────────
    askQuantity: '¿Cuántas unidades de {productName}? (máx {stock}) 🛒',
    invalidProductSelection: 'Selección inválida. Elige un número del 1 al {count}',
    cartListWithActions:
      '{lista}\n\nPara eliminar: *eliminar [N]*\nPara modificar cantidad: *modificar [N]*',
    cartActionConfirmPrompt:
      'Seleccionaste: *{productName}* 🛒\n1. Confirmar eliminación\n2. Modificar cantidad\n3. Cancelar',
    cartActionCancelled: 'Carrito sin cambios. Escribe *modificar carrito* para continuar.',
    cartManagementHint: 'Para seguir modificando tu carrito, escribe *modificar carrito*',
    cartModifyAskQuantity: '{productName} - tienes {quantity}.\n¿Cuántas quieres? (máx {stock})',
    cartModifySuccess: '✅ Actualizado: {productName} x{newQuantity}',
    cartRemoveSuccess: '✅ Eliminado: {productName} del carrito 🛒',
    cartItemNotFound: 'No encontré ese producto en tu carrito',
    noActiveSearch: 'No hay búsqueda activa. Escribe *buscar [nombre del producto]*',
    searchExpired: 'La búsqueda expiró. Escribe *buscar [nombre del producto]*',
    searchAskKeyword: '🔍 ¿Qué producto necesitas?\nEjemplo: *leche*, *papel higiénico*',
    searchResults:
      '📦 Productos encontrados:\n{lista}\n\nSelecciona digitando su número.\nPara buscar otro: *buscar [nombre]*{nextHint}',
    searchActionMenu:
      '✅ Seleccionaste: {productName} — ${price} 🛒\n\n1️⃣ Agregar al carrito\n2️⃣ Ver detalles\n3️⃣ Cancelar',
    searchNotFound: '⚠️ Producto no encontrado. Intenta con otra palabra o revisa la lista.',
    searchCancelled:
      '❌ Operación cancelada.\nPara buscar otro producto, escribe *buscar [nombre]*',
    searchViewDetails:
      '📋 {productName}\n\n{description}\n\nStock: {stock} disponibles\nPrecio: ${price}\n\n1️⃣ Agregar al carrito\n2️⃣ Cancelar',
    searchNextHint: '\nPara ver más: *siguiente*',
    searchNoMorePages: 'No hay más productos. Estos son todos los resultados.',
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
  // PR-08: Handoff messages for human handoff flow (AC-13)
  handoffMessages: {
    requestReceived:
      '¡Entendido! 🛒 Te conecto con nuestro equipo de {merchant_name}. Un momento por favor...',
    escalationDetected:
      'Veo que necesitas asistencia. Te conecto con nuestro equipo. Un momento... 🛒',
    merchantNotification: '🔔 *Atención requerida*\n\n👤 Cliente: {customerName}\n\n{summary}',
  },
};
