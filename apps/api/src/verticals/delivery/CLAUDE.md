# CLAUDE.md — verticals/delivery (Closy Delivery Agent)

Contexto acotado para trabajar en este módulo **sin leer todo el repo**.

## Qué es
El agente de pedidos a domicilio por WhatsApp para restaurantes de comidas rápidas. El cliente pide en lenguaje natural y el agente, con tool calling sobre el catálogo, arma el carrito. El checkout existente se extiende con zona, tarifa, horario y pago. Los pedidos salen a cocina por el WhatsApp del encargado y el ciclo es confirmado → preparando → en camino → entregado.
Spec: `docs/delivery-agent/SPEC.md` · Contratos: `docs/delivery-agent/CONTRACTS.md` (`contracts.ts` aquí es su copia literal y está **congelado**).

## Reglas de este módulo
1. **Feature flag:** todo se activa solo si `FeatureFlagsService.isDeliveryEnabled` y `merchant.industry === 'restaurante'`. Con el flag apagado, `DeliveryVerticalHandler.canHandle` devuelve `false` **sin tocar la base de datos**.
2. **El LLM no escribe cifras.** Los precios y totales salen de `presenters/*`. `agregar_al_carrito` solo acepta variantIds vistos en `buscar_producto` en el mismo turno (`ctx.seenVariantIds`).
3. **Reutiliza, no copies:** `CatalogService.searchProducts` (FTS), `CartService`, `CheckoutService` y `CheckoutFlow`, `ExpectingService` (estado multi-paso en `Conversation.metadata.expecting`), `OutboxService.enqueueWhatsAppText` (usa `dedupeKey`), `MerchantNotificationService`, `HandoffService`, `LlmService`/`GroqLlmProvider`.
4. **Archivos legacy:** solo los puntos de extensión de CONTRACTS §2, y solo si tu track es dueño del archivo.
5. **Tests:** cada `*.service.ts` tiene su `*.spec.ts`. Los e2e van en `apps/api/test/delivery-*.e2e-spec.ts`. LLM siempre con `test/utils/fake-llm.provider.ts`.
6. **Textos al cliente:** español colombiano, cortos, máximo 1 emoji por mensaje, cifras con formato `$28.000`.
7. **POS:** nunca llames a un POS desde el agente, el checkout o el ciclo de vida. Solo `PosOrderSink` habla con `PosAdapter`. Un conector nuevo = una clase en `pos/adapters/` + registro en `POS_ADAPTERS` + `describePosAdapterContract()`.
8. **Media:** la visión solo describe y nunca da precios ni ids. Todo match pasa por `CatalogMatcherService` y se confirma con el cliente. La media no se persiste ni se loguea.
9. **PII:** nada de texto del cliente ni teléfonos sin máscara en los logs.

## Mapa del módulo
```
contracts.ts           interfaces congeladas
delivery.module.ts     registro Nest (providers, ORDER_SINKS, SHIPPING_QUOTE_PROVIDER)
config/                DeliveryConfigService (defaults, validación, isOpen, resolveZone, quote)
agent/                 DeliveryAgentService (bucle de herramientas), prompt, tools/*, fallback-parser
catalog/               CatalogMatcherService
checkout/              DeliveryQuoteService (ShippingQuoteProvider)
lifecycle/             DeliveryOrderLifecycleService, CustomerStatusNotifier
sinks/                 OrderSink + WhatsAppKitchenSink + PosOrderSink
media/                 MediaFetcher (Graph API), MediaRouter, Transcriber (voz), ImageInterpreter (foto de producto / comprobante)
pos/                   Puerto POS: PosAdapterRegistry, NoopPosAdapter, kit de contrato, README "cómo agregar un POS"
commands/              comandos del comercio (agotado, tienda, reporte)
handler/               DeliveryVerticalHandler + guards (privacidad, horario, handoff, monto)
presenters/            cart, menu, kitchen-ticket
```
