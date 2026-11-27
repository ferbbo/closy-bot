# IMPLEMENTATION PLAN — Closy Delivery Agent

> Fuente: `docs/delivery-agent/SPEC.md` · Contratos: `docs/delivery-agent/CONTRACTS.md` · Avance: `docs/delivery-agent/STATUS.md`
> Unidad de trabajo: **Fase → Slice (= 1 PR) → Tarea (= 1 commit, ≤ 400 líneas cambiadas incluyendo tests)**.
> **TRACK** = un slice que puede correr en paralelo con otros slices de la misma fase, en un subagente y en su propio worktree.

## 0. Convenciones

| Elemento | Convención |
|---|---|
| Rama de integración | `feat/delivery-agent` (sale de `dev`). **Solo el Integrador hace push aquí.** |
| Rama de slice | `da/S{fase}.{n}-{slug}`, por ejemplo `da/S2.1-catalog-tools` |
| PR de slice | `da/S… → feat/delivery-agent`. Título: `[S2.1] Catalog tools + cart notes`. El cuerpo enlaza los AC y la evidencia |
| Commit | `feat(delivery): <qué> [S2.1-T2]` + trailers de atribución. Máximo 400 líneas (`git diff --shortstat`) |
| Tests | Unit: `*.spec.ts` junto al archivo. E2E: `apps/api/test/delivery-*.e2e-spec.ts` |
| Scope de flags | Todo el código de la vertical es **B2** → `FeatureFlagsService.isDeliveryEnabled` (falso con `FEATURES_MODE=mvp`) |
| LLM en tests | Siempre `FakeLlmProvider` (guiones). Groq real **nunca** |

## 1. Puertas de verificación (Verificador)

| Nivel | Cuándo | Comandos | Debe ser |
|---|---|---|---|
| **Entorno de pruebas** | Siempre | Meta Sandbox (S1.5) para todo lo de WhatsApp; `FakeLlmProvider`, `FakeTranscriber` y `FakeImageInterpreter` para la IA | Nunca APIs reales |
| **G-commit** | Cada commit | `npx tsc --noEmit -p apps/api/tsconfig.json` · `pnpm lint` (sin `--fix` sobre archivos ajenos) · `npx jest <archivos del slice> ` · `pnpm test:e2e -- delivery` (si existe el e2e del slice y la base de datos está disponible) | 0 errores, verde |
| **G-slice** | Antes de mergear el PR del slice | `pnpm test` completo · `pnpm test:e2e` completo · `FEATURES_MODE=mvp pnpm test:e2e` | Verde salvo la línea base de fallos conocidos (STATUS §Baseline) |
| **G-release** | PR final `feat/delivery-agent → dev` | G-slice + AC-29 viaje e2e + checklist del SPEC §7 | Verde, revisión humana |

Si la base de datos para e2e no está disponible (ver STATUS §Entorno), G-slice se degrada a unit + integración de servicios con Prisma mockeado. El PR se marca `⚠️ e2e pendiente (ENV)` y la deuda queda en STATUS. **G-release nunca se degrada.**

## 2. Mapa de fases

| Fase | Objetivo | Slices (Tracks) | Paralelismo |
|---|---|---|---|
| F1 Fundaciones | Schema, flag, módulo, configuración, LLM con herramientas, mensajería con plantillas y Meta Sandbox | S1.1 → (S1.2 ∥ S1.3 ∥ S1.4) + S1.5 (Integrador) | S1.1 secuencial; luego 3 tracks mientras el Integrador hace S1.5 |
| F2 Toma de pedido IA | El agente arma el carrito desde lenguaje natural | (S2.1 ∥ S2.2) → S2.3 | 2 tracks + integración |
| F3 Checkout domicilio | Zona, tarifa, horario, pago, confirmación, comanda y puerto POS | (S3.1 ∥ S3.2 ∥ S3.4) → S3.3 | 3 tracks + integración |
| F4 Operación | Ciclo de cocina, autoservicio del cliente y comandos | S4.1 ∥ S4.2 ∥ S4.3 | 3 tracks |
| F5 Multimodal + robustez + release | Media (voz, foto de producto, comprobante) y debounce (P0), botón (P1), hardening | S5.0 → (S5.1 ∥ S5.2 ∥ S5.3) → S5.4 → S5.5 | integración + 3 tracks + release |

Orden de prioridad si el tiempo no alcanza: completar **F1–F4 + S5.0–S5.3 + S5.5** (P0). Solo S5.4 (botón) es P1 y se recorta primero. Si aun así no alcanza, se recorta S5.1 (debounce) antes que voz o imagen, y se registra el riesgo.

---

## F1 — Fundaciones

### S1.1 Schema + flag + esqueleto del módulo + contratos · *Integrador (secuencial)* · AC-01, AC-02 (parcial)
| Tarea | Commit | Archivos | Verificación |
|---|---|---|---|
| T1 | Cambios aditivos de schema de SPEC §3.4 (Industry, OrderStatus, deliveryConfig, CartItem.notes + unique, OrderItem.notes, campos de Order incluidos los de POS, `OutboxMessageType.SEND_TEMPLATE`, `Conversation.optedOutAt`, modelo `WhatsappTemplateState`) | `prisma/schema.prisma` | `prisma validate` + `db push` en la base local + tsc |
| T2 | Flag `isDeliveryEnabled` + `DELIVERY_ENABLED` / `DELIVERY_LLM_MODEL` / `DELIVERY_STT_MODEL` / `DELIVERY_VISION_MODEL` en Joi y `.env.example` + specs del flag (mvp=false) | `feature-flags.service(.spec).ts`, `env.validation.ts`, `.env.example` | unit |
| T3 | `verticals/vertical.types.ts`, `vertical-router.service.ts` (registro vacío) y `delivery/contracts.ts` (copia literal de CONTRACTS.md), `delivery.module.ts`, `delivery/CLAUDE.md`, registro en `app.module.ts` | nuevos + `app.module.ts` | tsc + arranque del módulo (test de compilación del módulo) |
| T4 | Hook en `ConversationOrchestrator`: después de resolver la conversación y antes del checkout activo, `const v = await this.verticalRouter.tryHandle(ctx); if (v) return v;`. Con el flag apagado retorna `null` sin consultas | `conversation.orchestrator.ts` + spec | spec del orquestador existente en verde + test nuevo "flag off → no delega" |
| T5 | Seed demo `prisma/seed-delivery.ts`: comercio "Burger Barrio" (restaurante), 4 categorías (Hamburguesas, Perros, Bebidas, Adiciones), ~14 productos, 3 zonas (Cabecera, Provenza, Cañaveral) + script `db:seed:delivery` | seed + `package.json` | `pnpm db:seed:delivery` local |

### S1.2 DeliveryConfigService · *Track B* · AC-02, AC-10 (parcial), AC-11 (parcial)
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `delivery-config.validator.ts` (validación pura → `{ok, errors[{path,msg}]}`) + `restaurante.defaults.ts` + specs | unit |
| T2 | `delivery-config.service.ts`: `get(merchantId)` (defaults + override), `isOpen(cfg, now)` → `{open, nextOpening?}` con zona horaria (Intl, sin dependencias nuevas), `resolveZone(cfg, text)` (normalización RN-08) + specs con tabla de casos (tildes, alias, palabras completas) | unit |
| T3 | `quote(cfg, {neighborhood, subtotal, fulfillment})` → `ShippingQuote` (RN-09 a RN-11) + specs | unit |
| T4 | Merchant settings: aceptar `deliveryConfig` en el PATCH existente (DTO + validator → 400 con path) | e2e `delivery-config.e2e-spec.ts` |

### S1.3 LLM con herramientas · *Track C* · base de AC-03/04/07
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Extender `LlmProvider`: `generateWithTools(req: LlmToolRequest): Promise<LlmToolResponse>` y `generateJson<T>()`, con implementación Groq (`tools`, `tool_choice:'auto'`, `response_format`), timeout y mapeo de errores → `LlmFailure` | unit con el cliente groq mockeado |
| T2 | `FakeLlmProvider` (test util compartido en `apps/api/test/utils/fake-llm.provider.ts`, que también se exporta para unit) con guiones `[{toolCalls}|{text}]` | unit |
| T3 | `LlmService.runToolLoop()` genérico: máximo N iteraciones, ejecuta handlers registrados, corta ante error y devuelve `{finalText, toolTrace, fallbackReason?}` | unit |

### S1.5 Meta Sandbox (app de prueba + Graph API falso) · *Integrador, en paralelo con los tracks de F1* · AC-38 · P0
> Lo consumen los e2e de S1.4, S2.3, S3.3, S4.x y S5.x. **Ningún test usa graph.facebook.com.**

| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `apps/api/test/meta-sandbox/sandbox-app.ts`: identidad de la app de prueba (`appId`, `appSecret`, `wabaId`, `phoneNumberId`, `accessToken`, `verifyToken`, número del encargado y de 3 clientes) + `env.ts` que fija `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `META_*` para los e2e (se integra en `jest-e2e.setup.ts` sin romper los valores existentes) | e2e existentes en verde |
| T2 | `fake-graph-api.ts` (express de `@nestjs/platform-express`, puerto efímero, arranque y parada por suite): `POST /:v/:pnid/messages` (valida text/template/interactive, rechaza una plantilla no registrada o un parámetro con `\n` con el JSON de error de Meta, responde `wamid.SANDBOX…` y registra el mensaje), `GET /:v/:mediaId` + `GET /__media/:id` (fixtures de audio `.ogg` e imagen `.jpg` pequeños), `POST`/`GET /:v/:waba/message_templates` (valida categoría, nombre, ejemplos y parámetros; estado APPROVED), `POST /__sandbox/fail-next` (simula 429/500/131047) y `GET /__sandbox/sent` (inspección) | unit del fake |
| T3 | `webhook-builders.ts`: `inboundText`, `inboundAudio`, `inboundImage(caption?)`, `buttonReply`, `templateStatusUpdate`, `templateCategoryUpdate`, `phoneQualityUpdate` + `signPayload(body, appSecret)` → `X-Hub-Signature-256`; e2e `meta-sandbox.e2e-spec.ts` (AC-38 a–d) | e2e |
| T4 | Modo standalone para la demo local: `pnpm meta:sandbox` (puerto 4010) + `scripts/simulate-whatsapp.ts "<texto>" --from <tel> [--audio\|--image]` que firma y envía el webhook a la API local; documentado en `docs/delivery-agent/DEMO.md` | manual + e2e (AC-38 e) |

### S1.4 Mensajería de negocio + plantillas WhatsApp · *Track A* · AC-34, AC-35 (parcial), AC-36, AC-37 (base) · P0
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Soporte de `SEND_TEMPLATE` en el dispatcher del outbox y en `WhatsAppOutboundService` (payload `type: template`, `language.code`, `components[body].parameters` con `parameter_name`) sin tocar `SEND_TEXT` | specs del outbox y del outbound en verde + nuevos |
| T2 | `whatsapp-templates.catalog.ts` (las 10 plantillas de SPEC §4.6a con ejemplos) + lint en tests (RN-31: UTILITY, sin palabras promocionales, sin cuerpos solo de variables, parámetros sin `\n`) + `scripts/register-whatsapp-templates.ts` (`--dry-run` por defecto; `--apply` exige `WABA_ID` + token del canal; nunca corre en CI) | unit |
| T3 | `CustomerServiceWindowService.isOpen(merchantId, phone)` (último mensaje **entrante** < 24 h − 5 min, desde `InboundMessage`/`MessageLog`) + `BusinessMessenger.notify({merchantId, to, template, params, dedupeKey, conversationId?, freeTextFallback?})` → decide plantilla o texto según `notifications.mode`, ventana, opt-out (RN-29), tope por pedido (RN-30) y `WhatsappTemplateState` (RN-31). Devuelve `{status:'queued'\|'skipped', channel, reason?}` | unit (matriz de decisiones) |
| T4 | Webhooks de WABA: `message_template_status_update`, `template_category_update` y `phone_number_quality_update` → upsert en `WhatsappTemplateState` / alerta (`alerta_operacion`) en el controlador de webhook existente, sin romper el campo `messages` | unit + e2e `delivery-templates.e2e-spec.ts` con el Meta Sandbox (si S1.5 no está mergeado aún, el e2e se agrega en el mismo PR después de rebasear sobre S1.5) |

---

## F2 — Toma de pedido IA

### S2.1 Herramientas de catálogo + matcher + menú · *Track A* · AC-05, AC-06, AC-09
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `CatalogMatcherService.search(merchantId, query, limit=5)`: reutiliza `CatalogService.searchProducts` (FTS existente) y aplana a variantes activas `{variantId, label, unitPrice, score}`; clasifica MATCHED / AMBIGUOUS / NOT_FOUND con umbral relativo | unit con fixtures |
| T2 | Herramientas `buscar_producto` y `ver_menu` (schemas JSON + handlers) + `MenuPresenter` paginado | unit |
| T3 | Fallback determinista `parseOrderText(text)` → `ParsedOrderLine[]` (números en dígito y palabra "dos/una/media docena", separadores "y" / ","; notas tras "sin/con/extra") + 20 frases colombianas de fixture | unit |

### S2.2 Carrito con notas y sin stock · *Track B* · AC-08, RN-04/05
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `CartService.addItem(..., opts?: {notes?: string; skipStockCheck?: boolean})` retrocompatible; upsert por `(cartId, variantId, notes)`; `getCartSummary` incluye las notas | specs existentes de cart en verde + nuevos |
| T2 | `CheckoutService.createOrder` copia `notes` a `OrderItem.notes` y acepta `extras?: {deliveryZone, etaMinutes, shippingCost, fulfillment, cashChangeFor, neighborhood, reference}` (opcional y retrocompatible; único cambio legacy de checkout en toda la vertical) | specs de checkout en verde + nuevos |
| T3 | Herramientas `agregar_al_carrito`, `quitar_del_carrito`, `ver_carrito` + `CartPresenter` (las cifras salen solo de aquí) + guard RN-02 (variantIds vistos en el turno) | unit |

### S2.3 Agente + handler vertical · *Integrador después de S2.1 y S2.2* · AC-03, AC-04, AC-07, AC-22, AC-23
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `delivery-agent.prompt.ts` (persona RN-27: natural, breve, colombiano, sin menús obligatorios; reglas RN-01/19; memoria = summary + últimos 8 mensajes existentes) + `DeliveryAgentService.handleTurn(ctx)` con `runToolLoop` + fallback S2.1-T3 | unit con FakeLlm |
| T2 | `GroundingValidator` (RN-28: extracción de montos y minutos, verificación contra la traza de herramientas, carrito y config, 1 reintento, respaldo del presenter) + persistencia de `lastCandidates` (TTL 30 min) para la selección libre (RN-02) | unit (AC-33, AC-05) |
| T3 | `DeliveryVerticalHandler`: `canHandle` (flag + industria restaurante), guards de privacidad (RN-18), opt-out (RN-29), horario (RN-07) y handoff activo → agente | unit |
| T4 | Registro del handler en `VerticalRouter` + e2e `delivery-order.e2e-spec.ts` (webhook → carrito con notas; AC-03/05/06/22/23/35) | e2e |

---

## F3 — Checkout de domicilio (conversacional, con herramientas; el `CheckoutFlow` legacy no se toca)

> Estado del checkout en `Conversation.metadata.delivery.checkout` (`CheckoutDraft`, CONTRACTS §1). Las herramientas validan y persisten; el LLM solo conversa.

### S3.1 Entrega y cotización · *Track A* · AC-11, AC-12, AC-32 (parcial)
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `DeliveryQuoteService` (implementa `ShippingQuoteProvider` con DeliveryConfigService + extracción de barrio de la dirección: segmento tras coma o guion, o match contra zonas y alias) | unit |
| T2 | Herramientas `fijar_entrega` (dirección, barrio, referencia, `fulfillment` delivery/pickup → persiste en `CheckoutDraft`) y `cotizar_domicilio` (→ `ShippingQuote`; `NEEDS_NEIGHBORHOOD` / `OUT_OF_COVERAGE` / `BELOW_MINIMUM` como datos para que el LLM lo explique natural) | unit |
| T3 | Casos de conversación: datos en un solo mensaje, en desorden y corrección ("no, es en Provenza") con FakeLlm | unit |

### S3.2 Pago, horario y límites · *Track B* · AC-10, AC-13, AC-24
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Guard de horario aplicado a las herramientas de carrito y checkout (`isOpen`); la respuesta con la próxima apertura la redacta el LLM con el dato | unit |
| T2 | Herramienta `fijar_pago` (`cod` / `transfer` según `PaymentMethodConfig`; `cashChangeFor` con parser "50 mil / 50.000 / 50k / con 50"; validación ≥ total; las instrucciones de transferencia se devuelven como dato) | unit |
| T3 | Límite `maxOrderAmountWithoutHuman` → handoff (servicio existente) + pickup (fee 0) | unit |

### S3.4 Puerto POS (Adapter) · *Track C* · AC-30 · P0
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `delivery/pos/`: `PosAdapterRegistry` (resuelve el adapter por `config.pos.provider`; un proveedor desconocido o deshabilitado cae a Noop con warning) + `NoopPosAdapter` + `FakePosAdapter` (test util, configurable ok/falla/retryable) | unit |
| T2 | `testing/pos-adapter.contract-spec.ts`: `describePosAdapterContract(factory)`, una batería reutilizable (capabilities coherentes, `pushOrder` idempotente por `orderId`, errores tipados sin throw, nunca expone `secretRef`). Se aplica a Noop y Fake | unit |
| T3 | `PosOrderSink` (implementa `OrderSink`): llama al adapter, persiste `posProvider/posExternalId/posSyncStatus`, 1 reintento si `retryable` y aviso al encargado si falla (RN-23) + `pos/README.md` "Cómo agregar un POS" (checklist de 5 pasos + ejemplo esqueleto) | unit |

### S3.3 Confirmación + OrderSink · *Integrador después de S3.1, S3.2 y S3.4* · AC-14, AC-15, AC-30, AC-32, AC-37
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Herramientas `resumen_pedido` (→ `OrderSummaryPresenter` con el bloque exacto + `confirmationToken` ligado al hash) y `confirmar_pedido` (RN-12: resumen en turno previo, hash, vencimiento, afirmación) → `CheckoutService.createOrder(extras)` + `confirmedAt` + plantilla `pedido_confirmado` vía `BusinessMessenger` | unit |
| T2 | `OrderSink` + `WhatsAppKitchenSink` (vía `BusinessMessenger`: texto completo con la ventana del encargado abierta y `mode=auto`, si no plantilla `comanda_nuevo_pedido`; `dedupeKey order:{id}:kitchen`) + `KitchenTicketPresenter` + registro en `ORDER_SINKS` en orden `[WhatsAppKitchenSink, PosOrderSink]` (los errores de un sink no detienen al siguiente) | unit |
| T3 | e2e `delivery-checkout.e2e-spec.ts`: pedido natural → entrega + pago en un mensaje → resumen → "dale" → Order + comanda + plantilla de confirmación | e2e |

---

## F4 — Operación

### S4.1 Ciclo de vida de cocina · *Track A* · AC-16
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `DeliveryOrderLifecycleService.transition(orderRef, to, opts)` con la tabla RN-14, idempotencia y `cancelledAt` | unit |
| T2 | `CustomerStatusNotifier` → `BusinessMessenger.notify` con la plantilla de §4.6a por estado (`dedupeKey order:{id}:status:{s}`) | unit |
| T3 | Parser y servicio de comandos: `preparando N [min]`, `salio N`, `entregado N`, `cancelar N [motivo]`, registrados como comandos **adicionales** (solo con el flag activo) sin romper `enviado`/`confirmar` existentes + e2e `delivery-lifecycle.e2e-spec.ts` | unit + e2e |

### S4.2 Autoservicio del cliente · *Track B* · AC-17, AC-18, AC-19
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Herramientas `estado_pedido` (último pedido activo + ETA restante) y `cancelar_pedido` (RN-16 → lifecycle de S4.1 vía contrato; se puede stubear hasta que S4.1 se mergee) | unit |
| T2 | Herramienta `repetir_pedido` (último entregado → re-agregar activos con precio actual + avisos) | unit |
| T3 | Casos e2e en `delivery-customer.e2e-spec.ts` | e2e |

### S4.3 Comandos de operación del comercio + reporte · *Track C* · AC-20, AC-21
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `agotado <texto>` / `disponible <texto>` (RN-22, desambiguación numerada) | unit |
| T2 | `cerrar tienda` / `abrir tienda` (`temporarilyClosed`) + `ayuda` extendida con los comandos de delivery | unit |
| T3 | `reporte` / `reporte mes` (pedidos facturables §0.2, en la zona horaria del comercio) + e2e | unit + e2e |

---

## F5 — Robustez + release

| Slice | Track | Prioridad | Tareas | AC |
|---|---|---|---|---|
| S5.0 Media plumbing | Integrador | **P0** | T1 propagar `mediaType`, `mediaId`, `caption` y `mimeType` del mapper → `OrchestratorInput` (campos opcionales) → `VerticalContext.input` · T2 `MediaFetcher` (Graph API `GET /{media-id}` → url → descarga con el token del canal, límites RN-24) + `FakeMediaFetcher` · T3 `MediaRouter` en el handler: `audio` → `Transcriber`, `image` → `ImageInterpreter` (stubs con fallback "escríbelo" hasta que entren S5.2 y S5.3). Con el flag apagado, media = comportamiento legacy | — (base de AC-26/27/31) |
| S5.1 Debounce | A | **P0** | T1 buffer en `Conversation.metadata.pendingBurst` + ventana `DELIVERY_DEBOUNCE_MS` (4000): el webhook guarda y responde 200, y un procesamiento diferido por conversación (timeout de `@nestjs/schedule`, re-armable) concatena los textos y llama al orquestador una vez. **Un mensaje de media vacía el buffer y se procesa como turno propio** · T2 tests de ráfaga + reinicio seguro (un barrido cada minuto procesa los buffers vencidos) | AC-25 |
| S5.2 Voz | B | **P0** | T1 `Transcriber` (interfaz + `GroqWhisperTranscriber` vía SDK o REST + `FakeTranscriber`) · T2 audio → texto → mismo turno del agente con el eco "🎙️ Entendí: «…»" + fallos RN-24 + e2e `delivery-media.e2e-spec.ts` (caso voz) | AC-26 |
| S5.3 Imagen: producto + comprobante | C | **P0** | T1 `ImageInterpreter` (interfaz + `GroqVisionInterpreter` con prompt de solo descripción → JSON `ImageInterpretation` validado + `FakeImageInterpreter`) · T2 `kind:'product'` → `CatalogMatcherService` → candidatos guardados en `lastCandidates` (con cantidad) que el agente presenta conversando → el cliente elige libremente → carrito (RN-25) · T3 `kind:'payment_receipt'` o caption de pago con `pending_payment` → reenvío al encargado (`dedupeKey order:{id}:receipt:{wamid}`) + respuesta al cliente (RN-26) · T4 casos e2e (producto, comprobante, other) | AC-27, AC-31 |
| S5.4 Botón interactivo | C (después de S5.3) | P1 | T1 `OutboxMessageType.SEND_INTERACTIVE` (aditivo) + sender · T2 confirmación con botones Sí/No + mapeo de `button_reply` al mismo flujo | AC-28 |
| S5.5 Hardening + release | Integrador | **P0** | T1 `delivery-journey.e2e-spec.ts` (AC-29) · T2 corrida `FEATURES_MODE=mvp` + fixes · T3 sección en `BACKEND-EXECUTION-GUIDE.md` (config, comandos, cURL) + `docs/delivery-agent/DEMO.md` (simular webhook) · T4 PR final `feat/delivery-agent → dev` con checklist §7 | AC-01, AC-29 |

---

## 3. Grafo de dependencias
```
S1.1 ──┬─► S1.2 ──┐
       ├─► S1.4 ──┤ (BusinessMessenger: lo consumen S3.3, S4.1, S5.3)
       ├─► S1.5 ──┤ (Meta Sandbox: lo consumen todos los e2e de la vertical)
       └─► S1.3 ──┼─► S2.1 ──┐
                  └─► S2.2 ──┴─► S2.3 ──┬─► S3.1 ──┐
                                        ├─► S3.2 ──┤
                                        └─► S3.4 ──┴─► S3.3 ──┬─► S4.1 ─┐
                                                              ├─► S4.2 ─┤ (S4.2 usa el contrato de S4.1; stub hasta el merge)
                                                              └─► S4.3 ─┴─► S5.0 ─► S5.1 ∥ S5.2 ∥ (S5.3 → S5.4) ─► S5.5
```

## 4. Calendario objetivo (18 corridas, cada 2 h, desde vie 27-nov 18:00 hasta dom 29-nov 04:00, America/Bogota)
| Corridas | Objetivo |
|---|---|
| 1–2 | F1 completa (S1.1 y luego S1.2 ∥ S1.3 ∥ S1.4, con S1.5 del Integrador en paralelo) |
| 3–6 | F2 |
| 7–10 | F3 (S3.4 corre en paralelo con S3.1 y S3.2) |
| 11–14 | F4 |
| 15 | S5.0 media plumbing (rápido, del Integrador) + arranque de S5.1, S5.2 y S5.3 en paralelo |
| 16–17 | S5.1, S5.2 y S5.3 (P0); S5.4 solo si sobra tiempo |
| 18 | S5.5 release: PR final a `dev` y reporte |

Si una corrida termina antes, sigue con el próximo slice desbloqueado. Si se atrasa, recorta P1 y **nunca** S5.5.
