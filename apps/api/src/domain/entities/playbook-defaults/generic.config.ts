/**
 * Generic playbook defaults (PR-11 / PR-GAP-1)
 * Used as fallback when merchant has no industry set
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const GenericPlaybookDefaults: PlaybookConfig = {
  industry: 'retail_general',
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
    // ── PR-04.0: Search + Cart management (22 new keys) ──────────────────
    askQuantity: '¿Cuántas unidades de {productName}? (máx {stock})',
    invalidProductSelection: 'Selección inválida. Elige un número del 1 al {count}',
    cartListWithActions:
      '{lista}\n\nPara eliminar: *eliminar [N]*\nPara modificar cantidad: *modificar [N]*',
    cartActionConfirmPrompt:
      'Seleccionaste: *{productName}*\n1. Confirmar eliminación\n2. Modificar cantidad\n3. Cancelar',
    cartActionCancelled: 'Carrito sin cambios. Escribe *modificar carrito* para continuar.',
    cartManagementHint: 'Para seguir modificando tu carrito, escribe *modificar carrito*',
    cartModifyAskQuantity: '{productName} - tienes {quantity}.\n¿Cuántas quieres? (máx {stock})',
    cartModifySuccess: '✅ Actualizado: {productName} x{newQuantity}',
    cartRemoveSuccess: '✅ Eliminado: {productName} del carrito',
    cartItemNotFound: 'No encontré ese producto en tu carrito',
    searchExpired: 'La búsqueda expiró. Escribe *buscar [nombre del producto]*',
    searchAskKeyword: '🔍 ¿Qué producto quieres buscar?\nEjemplo: *camiseta*, *zapatos negros*',
    searchResults:
      '📦 Productos encontrados:\n{lista}\n\nSelecciona digitando su número.\nPara buscar otro: *buscar [nombre]*{nextHint}',
    searchActionMenu:
      '✅ Seleccionaste: {productName} — ${price}\n\n1️⃣ Agregar al carrito\n2️⃣ Ver detalles\n3️⃣ Cancelar',
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
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 3,
  },
  // PR-FE-OB-2: "Retail General" FAQ preset (5 items) — wizard step-customize defaults
  faqs: [
    {
      question: '¿Cuánto demora el envío?',
      keywords: ['envio', 'demora', 'llega', 'tiempo', 'dias'],
      answer: 'Los envíos demoran 3-5 días hábiles después de confirmar tu pago 📦',
    },
    {
      question: '¿Hacen envíos a mi ciudad?',
      keywords: ['envio', 'ciudad', 'departamento', 'llegan', 'envian'],
      answer: '¡Sí! Hacemos envíos a toda Colombia 🇨🇴',
    },
    {
      question: '¿Puedo cambiar o devolver?',
      keywords: ['cambio', 'devolucion', 'devolver', 'cambiar', 'garantia'],
      answer: 'Tienes 8 días para cambios. El producto debe estar sin uso y con etiquetas 🏷️',
    },
    {
      question: '¿Qué métodos de pago aceptan?',
      keywords: ['pago', 'pagar', 'nequi', 'transferencia', 'efectivo', 'tarjeta'],
      answer: 'Aceptamos efectivo contra entrega, transferencia/Nequi y links de pago 💳',
    },
    {
      question: '¿Tienen garantía?',
      keywords: ['garantia', 'defecto', 'danado', 'roto'],
      answer: 'Todos nuestros productos tienen garantía de 30 días por defectos de fábrica ✅',
    },
  ],
  // PR-08: Handoff messages for human handoff flow (AC-13)
  handoffMessages: {
    requestReceived:
      'Entendido. Te conecto con una persona de nuestro equipo. Un momento por favor...',
    escalationDetected:
      'Veo que necesitas ayuda específica. Te conecto con nuestro equipo. Un momento...',
    merchantNotification: '🔔 *Atención requerida*\n\n👤 Cliente: {customerName}\n\n{summary}',
  },
};
