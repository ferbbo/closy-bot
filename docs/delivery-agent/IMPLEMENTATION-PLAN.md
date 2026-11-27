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
| **G-commit** | Cada commit | `npx tsc --noEmit -p apps/api/tsconfig.json` · `pnpm lint` (sin `--fix` sobre archivos ajenos) · `npx jest <archivos del slice> ` · `pnpm test:e2e -- delivery` (si existe el e2e del slice y la base de datos está disponible) | 0 errores, verde |
| **G-slice** | Antes de mergear el PR del slice | `pnpm test` completo · `pnpm test:e2e` completo · `FEATURES_MODE=mvp pnpm test:e2e` | Verde salvo la línea base de fallos conocidos (STATUS §Baseline) |
| **G-release** | PR final `feat/delivery-agent → dev` | G-slice + AC-29 viaje e2e + checklist del SPEC §7 | Verde, revisión humana |

Si la base de datos para e2e no está disponible (ver STATUS §Entorno), G-slice se degrada a unit + integración de servicios con Prisma mockeado. El PR se marca `⚠️ e2e pendiente (ENV)` y la deuda queda en STATUS. **G-release nunca se degrada.**

## 2. Mapa de fases

| Fase | Objetivo | Slices (Tracks) | Paralelismo |
|---|---|---|---|
| F1 Fundaciones | Schema, flag, módulo, configuración y LLM con herramientas | S1.1 → (S1.2 ∥ S1.3) | S1.1 secuencial y del Integrador |
| F2 Toma de pedido IA | El agente arma el carrito desde lenguaje natural | (S2.1 ∥ S2.2) → S2.3 | 2 tracks + integración |
| F3 Checkout domicilio | Zona, tarifa, horario, pago, confirmación, comanda y puerto POS | (S3.1 ∥ S3.2 ∥ S3.4) → S3.3 | 3 tracks + integración |
| F4 Operación | Ciclo de cocina, autoservicio del cliente y comandos | S4.1 ∥ S4.2 ∥ S4.3 | 3 tracks |
| F5 Robustez + release | Debounce y comprobante (P0), voz y botón (P1), hardening | S5.1 ∥ S5.2 ∥ S5.3 → S5.4 → S5.5 | 3 tracks + release |

Orden de prioridad si el tiempo no alcanza: completar **F1–F4 + S5.1 + S5.2 + S5.5** (P0). S5.3 y S5.4 son P1 y se recortan primero.

---

## F1 — Fundaciones

### S1.1 Schema + flag + esqueleto del módulo + contratos · *Integrador (secuencial)* · AC-01, AC-02 (parcial)
| Tarea | Commit | Archivos | Verificación |
|---|---|---|---|
| T1 | Cambios aditivos de schema de SPEC §3.4 (Industry, OrderStatus, deliveryConfig, CartItem.notes + unique, OrderItem.notes, campos de Order) | `prisma/schema.prisma` | `prisma validate` + `db push` en la base local + tsc |
| T2 | Flag `isDeliveryEnabled` + `DELIVERY_ENABLED` / `DELIVERY_LLM_MODEL` en Joi y `.env.example` + specs del flag (mvp=false) | `feature-flags.service(.spec).ts`, `env.validation.ts`, `.env.example` | unit |
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
| T2 | `CheckoutService.createOrder` copia `notes` a `OrderItem.notes` y acepta `extras?: {deliveryZone, etaMinutes, shippingCost, fulfillment, cashChangeFor}` (opcional y retrocompatible) | specs de checkout en verde + nuevos |
| T3 | Herramientas `agregar_al_carrito`, `quitar_del_carrito`, `ver_carrito` + `CartPresenter` (las cifras salen solo de aquí) + guard RN-02 (variantIds vistos en el turno) | unit |

### S2.3 Agente + handler vertical · *Integrador después de S2.1 y S2.2* · AC-03, AC-04, AC-07, AC-22, AC-23
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `delivery-agent.prompt.ts` (sistema acotado, RN-01/19) + `DeliveryAgentService.handleTurn(ctx)` usando `runToolLoop` + fallback S2.1-T3 | unit con FakeLlm |
| T2 | `DeliveryVerticalHandler`: `canHandle` (flag + industria restaurante), guards de privacidad (RN-18), horario (RN-07) y handoff activo; enruta a agente, menú y estados de espera `delivery_disambiguation`; "confirmar" → `CheckoutFlow.start` existente | unit |
| T3 | Registro del handler en `VerticalRouter` + e2e `delivery-order.e2e-spec.ts` (webhook → carrito con notas; AC-03/05/06/22/23) | e2e |

---

## F3 — Checkout de domicilio

### S3.1 Cotización de domicilio en checkout · *Track A* · AC-11, AC-12
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Token `SHIPPING_QUOTE_PROVIDER` + `FlatShippingQuoteProvider` por defecto (comportamiento actual) inyectado en `CheckoutService` | specs de checkout en verde |
| T2 | `DeliveryQuoteService` (implementa el provider usando DeliveryConfigService + extracción de barrio de la dirección: último segmento tras coma o guion, o match contra zonas/alias) | unit |
| T3 | `CheckoutFlow`: tras `ASK_ADDRESS` → cotizar → `NEEDS_NEIGHBORHOOD` (nuevo paso `ASK_NEIGHBORHOOD`), `OUT_OF_COVERAGE` (ofrecer pickup) o `BELOW_MINIMUM` (volver al carrito) | unit + specs existentes |

### S3.2 Horario, pago y límites · *Track B* · AC-10, AC-13, AC-24
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Guard de horario en el handler, aplicado en checkout y carrito (`isOpen`) + mensajes con la próxima apertura | unit |
| T2 | Paso `ASK_CASH_CHANGE` cuando el pago es `cod` y la vertical está activa: parser "50 mil / 50.000 / 50k" + validación ≥ total | unit |
| T3 | Opción "Recoger en el local" (`fulfillment=pickup`, fee 0) + límite `maxOrderAmountWithoutHuman` → handoff (servicio existente) | unit |

### S3.4 Puerto POS (Adapter) · *Track C* · AC-30 · P0
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `delivery/pos/`: `PosAdapterRegistry` (resuelve el adapter por `config.pos.provider`; un proveedor desconocido o deshabilitado cae a Noop con warning) + `NoopPosAdapter` + `FakePosAdapter` (test util, configurable ok/falla/retryable) | unit |
| T2 | `testing/pos-adapter.contract-spec.ts`: `describePosAdapterContract(factory)`, una batería reutilizable (capabilities coherentes, `pushOrder` idempotente por `orderId`, errores tipados sin throw, nunca expone `secretRef`). Se aplica a Noop y Fake | unit |
| T3 | `PosOrderSink` (implementa `OrderSink`): llama al adapter, persiste `posProvider/posExternalId/posSyncStatus`, 1 reintento si `retryable` y aviso al encargado si falla (RN-23) + `pos/README.md` "Cómo agregar un POS" (checklist de 5 pasos + ejemplo esqueleto) | unit |

### S3.3 Confirmación + OrderSink · *Integrador después de S3.1, S3.2 y S3.4* · AC-14, AC-15, AC-30
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | Resumen final con `CartPresenter` (subtotal, domicilio, total, ETA, pago, cambio) + persistencia de los extras en `createOrder` + `confirmedAt` | unit |
| T2 | `OrderSink` + `WhatsAppKitchenSink` (reutiliza `MerchantNotificationService`/outbox, `dedupeKey order:{id}:kitchen`) + `KitchenTicketPresenter` + registro en `ORDER_SINKS` en orden `[WhatsAppKitchenSink, PosOrderSink]` (los errores de un sink no detienen al siguiente) | unit |
| T3 | e2e `delivery-checkout.e2e-spec.ts`: lenguaje natural → dirección → zona → efectivo → "sí" → Order + comanda | e2e |

---

## F4 — Operación

### S4.1 Ciclo de vida de cocina · *Track A* · AC-16
| Tarea | Commit | Verificación |
|---|---|---|
| T1 | `DeliveryOrderLifecycleService.transition(orderRef, to, opts)` con la tabla RN-14, idempotencia y `cancelledAt` | unit |
| T2 | `CustomerStatusNotifier` (outbox `dedupeKey order:{id}:status:{s}`, chequeo de ventana de 24 h por `Conversation.lastMessageAt`) | unit |
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
| S5.1 Debounce | A | **P0** | T1 buffer en `Conversation.metadata.pendingBurst` + ventana `DELIVERY_DEBOUNCE_MS` (4000): el webhook guarda y responde 200, y un procesamiento diferido por conversación (timeout de `@nestjs/schedule`, re-armable) concatena los textos y llama al orquestador una vez · T2 tests de ráfaga + reinicio seguro (si el proceso muere, un barrido cada minuto procesa los buffers vencidos) | AC-25 |
| S5.2 Comprobante | B | **P0** | T1 detectar mensaje `image` del cliente con un pedido `pending_payment` (el mapper ya trae `mediaType`) · T2 reenviar al encargado (media id/url + `ORD-x` + monto esperado) con `dedupeKey order:{id}:receipt:{wamid}` y responder al cliente "Recibimos tu comprobante, el local lo valida" | AC-27 |
| S5.3 Voz | C | P1 | T1 `MediaService` (descarga desde Graph API con el token del canal) · T2 `Transcriber` (interfaz + Groq `audio.transcriptions` + fake) → mismo turno de texto | AC-26 |
| S5.4 Botón interactivo | C (después de S5.3) | P1 | T1 `OutboxMessageType.SEND_INTERACTIVE` (aditivo) + sender · T2 confirmación con botones Sí/No + mapeo de `button_reply` al mismo flujo | AC-28 |
| S5.5 Hardening + release | Integrador | **P0** | T1 `delivery-journey.e2e-spec.ts` (AC-29) · T2 corrida `FEATURES_MODE=mvp` + fixes · T3 sección en `BACKEND-EXECUTION-GUIDE.md` (config, comandos, cURL) + `docs/delivery-agent/DEMO.md` (simular webhook) · T4 PR final `feat/delivery-agent → dev` con checklist §7 | AC-01, AC-29 |

---

## 3. Grafo de dependencias
```
S1.1 ──┬─► S1.2 ──┐
       └─► S1.3 ──┼─► S2.1 ──┐
                  └─► S2.2 ──┴─► S2.3 ──┬─► S3.1 ──┐
                                        ├─► S3.2 ──┤
                                        └─► S3.4 ──┴─► S3.3 ──┬─► S4.1 ─┐
                                                              ├─► S4.2 ─┤ (S4.2 usa el contrato de S4.1; stub hasta el merge)
                                                              └─► S4.3 ─┴─► S5.1 ∥ S5.2 ∥ (S5.3 → S5.4) ─► S5.5
```

## 4. Calendario objetivo (18 corridas, cada 2 h, desde vie 27-nov 18:00 hasta dom 29-nov 04:00, America/Bogota)
| Corridas | Objetivo |
|---|---|
| 1–2 | F1 completa |
| 3–6 | F2 |
| 7–10 | F3 (S3.4 corre en paralelo con S3.1 y S3.2) |
| 11–14 | F4 |
| 15–16 | S5.1 + S5.2 (P0) |
| 17 | S5.3 / S5.4 (P1, lo que alcance) |
| 18 | S5.5 release: PR final a `dev` y reporte |

Si una corrida termina antes, sigue con el próximo slice desbloqueado. Si se atrasa, recorta P1 y **nunca** S5.5.
