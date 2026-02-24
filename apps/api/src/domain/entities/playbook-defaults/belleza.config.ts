/**
 * Playbook defaults for BELLEZA (Beauty/Cosmetics) industry (PR-11 / PR-GAP-1)
 */

import { PlaybookConfig } from '../playbook-config.interface';

export const BellezaPlaybookDefaults: PlaybookConfig = {
  industry: 'belleza',
  botPersonality: {
    style: 'friendly',
    emojiUsage: 'moderate',
    signatureEmoji: '✨',
  },
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
    addToCartConfirm:
      'Perfecto! Agregado a tu carrito 💄\n\n✨ {product_name} - {variant_name}\n💰 ${price}\n\n🛒 Total: *${cart_total}* ({cart_item_count} {cart_item_word})\n\nEscribe "ver carrito" para revisar o "buscar" para agregar más.',
    noStock:
      'Ese producto está agotado temporalmente. ¿Puedo recomendarte una alternativa similar?',
    upsellTemplate: 'Para complementar, te recomiendo {product} ✨',
    checkoutStart: '¡Excelente elección! Confirmemos tu pedido 📦',
    searchNoResults:
      '😔 No encontré productos para "{query}"\n\nIntenta con otras palabras o escribe "ayuda" para ver opciones.',
    searchResultsHeader: '🔍 Resultados para "{query}" ({count}):\n\n',
    searchResultsFooter: '\n\n💬 Para agregar al carrito, escribe el nombre del producto ✨',
    helpMenu:
      '📋 *Opciones disponibles*\n\n🔍 *Buscar productos*\nEscribe lo que buscas: "crema hidratante", "serum vitamina C"\n\n🛒 *Ver carrito*\nEscribe "ver carrito" o "carrito"\n\n❓ *Ayuda*\nEscribe "ayuda" o "menú"\n\n💬 *Hablar con un humano*\nEscribe "hablar con agente" o "ayuda humana"\n\n---\n\n¿En qué puedo ayudarte? ✨',
    cartEmpty:
      '🛒 *Tu carrito está vacío*\n\nEscribe "buscar" para explorar nuestros productos de belleza.',
    cartSummaryHeader: '🛒 *Tu carrito* ({item_count} {item_word})\n\n',
    cartSummaryFooter: '\n\n💰 *Total: ${total}*\n\n✏️ Para modificar, dime qué quieres cambiar.',
    removeConfirm: '✅ *{product_name} - {variant_name}* removido del carrito',
    updateConfirm: '✅ *Cantidad actualizada*\n\n{product_name}: {quantity} unidades',
    quantityInvalid: '❌ La cantidad debe estar entre 1 y 99 unidades.',
    productNotFound: '😔 No encontré "{query}"\n\nEscribe "buscar" para ver el catálogo ✨',
    productMultipleOptions:
      'Encontré varias opciones:\n\n{product_list}\n\n¿Cuál quieres agregar? Responde con el nombre exacto.',
    variantMultipleOptions:
      '*{product_name}* tiene varias opciones:\n\n{variant_list}\n\n¿Cuál variante quieres? Responde con el nombre.',
    itemNotInCart:
      'No encontré "{query}" en tu carrito.\n\nTu carrito tiene:\n{items_list}\n\n¿Cuál quieres modificar?',
    cartEmptyNoAction: '🛒 Tu carrito está vacío, no hay nada que {action}.',
    genericError: '❌ Error al {action}. Intenta de nuevo.',
    unknownIntent: 'No entendí tu mensaje. Escribe "ayuda" para ver opciones ✨',
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
  // PR-GAP-2: FAQ presets para industria Belleza (AC-04)
  faqs: [
    {
      question: '¿Cuánto tarda el envío?',
      keywords: ['envio', 'demora'],
      answer: 'Envíos en 2-4 días hábiles. Gratis en compras >$50k 🚚',
    },
    {
      question: '¿Aceptan devoluciones?',
      keywords: ['devolver', 'devolucion', 'no me gusto'],
      answer: 'Aceptamos devoluciones hasta 30 días sin abrir 💄',
    },
    {
      question: '¿Tienen lista de ingredientes?',
      keywords: ['ingredientes', 'componentes', 'alergia'],
      answer:
        'Todos nuestros productos tienen ingredientes en la etiqueta. ¿Alguna alergia específica? 🌿',
    },
    {
      question: '¿Cómo puedo pagar?',
      keywords: ['pago', 'metodos', 'transferencia'],
      answer: 'Aceptamos transferencia, link de pago y contra entrega 💳',
    },
    {
      question: '¿Tienen muestras?',
      keywords: ['muestra', 'prueba', 'tamano'],
      answer: 'Tenemos muestras de algunos productos. ¿Cuál te interesa? ✨',
    },
  ],
};
