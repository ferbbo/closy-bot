# PR Stack — Core V1 MVP (WhatsApp-first)

> Objetivo: proveer una “autopista” de PRs pequeños, dependientes y mergeables para construir el Core V1 MVP.
> 
> Regla de oro: cada PR se ejecuta con un **PR Brief** (1 página) antes de implementar.

## Convenciones

- IDs: `PR-01`, `PR-02`, ...
- Artefactos:
  - Stack global: `docs/plan/PR-STACK-core-v1.md`
  - Briefs: `docs/plan/pr-briefs/PR-XX-<slug>.md`
- DoD global (aplica a todos los PRs):
  - Idempotencia implementada y testeada donde aplique (`message_id`, `payment_intent_id`).
  - Estado persistido en Postgres (sin lógica “solo memoria”).
  - Guardrails: la IA NO inventa precio/stock/políticas/ETA.
  - `pnpm lint` y `pnpm test` pasan.

## Comandos estándar

- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Test: `pnpm test`
- DB (si aplica): `pnpm db:migrate` / `pnpm db:generate`

---

## Stack

### PR-01 — Inbound WhatsApp: normalización + dedupe persistido ✅ MERGED
- **Objetivo:** recibir webhook inbound, normalizar mensaje y asegurar "exactly-once" lógico vía dedupe por `message_id`.
- **Depende de:** bootstrap completado.
- **Incluye:** endpoint webhook + validación básica + persistencia de inbound events + dedupe por constraint unique.
- **Excluye:** NLP/LLM avanzado, catálogo/carrito.
- **DoD específico:** test de webhook duplicado (mismo `message_id`) se procesa 1 vez.

### PR-02 — Modelos base: merchant/customer/conversation + estado mínimo ✅ MERGED
- **Objetivo:** resolver identidad por teléfono y mantener `conversation_id` con estado mínimo persistido.
- **Depende de:** PR-01.
- **Incluye:** tablas/modelos + repos + servicios; correlación por `conversation_id` en logs.
- **Excluye:** flows de compra.

### PR-03 — Catálogo: import CSV + búsqueda simple ✅ MERGED
- **Objetivo:** cargar catálogo por CSV y buscar productos por texto.
- **Depende de:** PR-02.
- **Incluye:** schema productos/variantes/stock/precio + import service + búsqueda.
- **Excluye:** recomendaciones ML, integraciones Shopify/Woo.
- **Notas:** precios/stock siempre desde backend (guardrails).

### PR-03.5 — Outbound Sender + Orchestrator básico + Búsqueda catálogo conversacional 🔴 CRÍTICO
- **Objetivo:** habilitar conversación end-to-end (recibir → entender → responder) y búsqueda de catálogo via chat.
- **Depende de:** PR-03.
- **Incluye:**
  - WhatsApp Outbound Sender (enviar mensajes via Meta Cloud API)
  - Orchestrator básico (inbound → identity → router → outbound)
  - IntentRouter simple por keywords (SEARCH_PRODUCT, GREETING, HELP, UNKNOWN)
  - Merchant resolver por número receptor
  - Flujo de búsqueda catálogo con resultados paginados
- **Excluye:** LLM/NLP avanzado, carrito, checkout, botones interactivos.
- **DoD específico:** 
  - Usuario envía "busco X" → bot responde con productos del catálogo
  - Usuario envía "hola" → bot responde con saludo
  - Test e2e: inbound → outbound response
- **Issue:** #14 — **BLOCKER para todo el flujo de ventas**

### PR-03.6 — LLM Adapter: Groq + System Prompt conversacional 🟡 ENHANCEMENT
- **Objetivo:** integrar LLM con arquitectura adapter para respuestas naturales con tono vendedor/persuasivo.
- **Depende de:** PR-03.5.
- **Incluye:**
  - Módulo `llm/` con interface `LlmProvider` abstracta
  - `GroqLlmProvider` como implementación inicial (económico para MVP)
  - System prompt composable: base + playbook + merchant + context
  - Guardrails anti-hacking y anti-injection
  - Feature flag `LLM_ENABLED` para toggle
  - Fallback a respuestas templated si LLM falla
  - Stubs de prompts por industria (prepara PR-11)
- **Excluye:** RAG/vector DB, tool calling complejo, multi-provider routing.
- **DoD específico:**
  - Bot responde con lenguaje natural usando Groq
  - System prompt impide manipulación (prompt injection básico)
  - Fallback funcional si LLM falla
  - Provider intercambiable sin cambiar orchestrator
- **Issue:** #16

### PR-03.7 — Catalog Management API: Import masivo + CRUD productos ✅ MERGED
- **Objetivo:** exponer endpoints HTTP para (a) carga masiva de catálogo por CSV y (b) CRUD básico de productos/variantes, con multi-tenancy por `merchant`.
- **Depende de:** PR-03.
- **Incluye:**
  - Endpoint bulk import CSV (usa `ImportService` existente)
  - Endpoints CRUD de productos (create/update/delete/list/get) y variantes mínimas
  - Autenticación por `merchant.apiKey` (header `Authorization: Bearer <apiKey>` o `x-api-key`)
  - Validaciones DTOs + límites de payload (MVP)
  - Tests unitarios + e2e básicos (happy path + multi-tenant)
- **Excluye:** UI/admin dashboard, integraciones externas (POS/ERP), editor avanzado, RAG.
- **DoD específico:**
  - Import CSV crea/actualiza por SKU (idempotente) y retorna stats
  - CRUD no permite acceder/modificar productos de otro merchant
  - `pnpm test` pasa

### PR-03.8 — Meta WhatsApp Webhook Compliance: GET verify + raw payload + signature guard ✅ MERGED
- **Objetivo:** hacer el backend compatible con el flujo real de Meta WhatsApp Cloud API webhooks (verificación, payload crudo, firma).
- **Depende de:** PR-01 (inbound dedupe), PR-03.5 (outbound sender).
- **Incluye:**
  - GET `/webhooks/whatsapp` para verificación (`hub.mode`, `hub.verify_token` → `hub.challenge`)
  - POST `/webhooks/whatsapp` acepta payload crudo de Meta (`entry/changes/value/messages[]`)
  - Mapper `whatsapp-webhook.mapper.ts` que convierte payload Meta → `InboundMessageDto` normalizado
  - Guard `MetaSignatureGuard` para validar `X-Hub-Signature-256` con HMAC SHA-256 (timing-safe)
  - `rawBody: true` en NestJS bootstrap para cálculo correcto de firma
  - Manejo de eventos `statuses` con early return (200 OK sin procesar)
  - Env vars nuevas: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
  - Actualización de `.env.example` y `README.md` con instrucciones de setup
  - Tests E2E + unitarios (verify, mapper, signature)
- **Excluye:** media download, templates/botones interactivos, cambios al orchestrator/LLM.
- **DoD específico:**
  - GET verify con token correcto → retorna `hub.challenge` (text/plain)
  - GET verify con token incorrecto → 403
  - POST mensaje text → procesado por pipeline existente
  - POST con `statuses` → 200 OK sin procesar
  - Si `WHATSAPP_APP_SECRET` presente: firma inválida → 401; firma válida → 200
  - Si `WHATSAPP_APP_SECRET` ausente: log warning, permite request (modo dev)
  - `pnpm lint` y `pnpm test` pasan
- **Notas:**
  - Sin cambios de DB (no hay migraciones)
  - Referencia: [Meta Webhooks Getting Started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
  - Referencia: [WhatsApp Webhook Components](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components)

### PR-03.9 — Transactional Outbox: WhatsApp outbound confiable 🔴 CRÍTICO
- **Objetivo:** evitar dual-write y garantizar envío eventual de outbound WhatsApp si el commit DB ocurrió (enqueue en outbox + dispatcher async).
- **Depende de:** PR-03.5 (outbound sender) y PR-03.8 (webhook compliance). (PR-02 recomendado por multi-tenancy/merchantId)
- **Incluye:**
  - Tabla `OutboxMessage` (Prisma) + índices + dedupeKey
  - `OutboxService.enqueueWhatsAppText(...)` (reemplaza envíos directos)
  - Worker scheduler con `FOR UPDATE SKIP LOCKED`, retries + backoff
  - Logs PII-safe + config flags
  - Tests unitarios (enqueue + dispatcher success/failure)
- **Excluye:** Kafka/SQS/Redis, CDC/Debezium, nuevos canales.
- **DoD específico:**
  - Webhook ACK rápido (no bloquea por envío)
  - 2 instancias worker sin doble-procesamiento por `SKIP LOCKED`
  - `pnpm lint`, `pnpm test`, `pnpm db:migrate` pasan
### PR-03.10 — Conversation Memory: historial corto + summary + retención 🟡 ENHANCEMENT
- **Objetivo:** habilitar continuidad conversacional "humana" con historial corto acotado (TTL) y resumen+facts long-lived, más jobs de cleanup/sumarización.
- **Depende de:** PR-03.5 (orchestrator), PR-03.6 (LLM adapter). Opcional: PR-03.9 (patrón scheduler similar).
- **Incluye:**
  - Modelo `MessageLog` (IN + OUT) con `expiresAt` para TTL
  - Campos en `Conversation`: `summary`, `memoryFacts`, `lastIntent`, `lastSummarizedAt`
  - Jobs `@nestjs/schedule`:
    - `message-log-cleanup.service.ts`: elimina logs expirados + cap por conversación
    - `conversation-summarization.service.ts`: actualiza summary + facts periódicamente
  - Context builder extendido: últimos K logs + summary+facts + estado de negocio
  - Config por env + override por merchant en `playbookConfig.memory`
  - Observabilidad PII-safe
- **Excluye:** archiving S3, partitioning, anonimización masiva, búsqueda CRM.
- **DoD específico:**
  - Migración crea `message_logs` + nuevos campos en `conversations`
  - Logs acotados por TTL + cap (job cleanup funcional)
  - Summary/facts se actualizan periódicamente (job summarization funcional)
  - LLM context usa últimos K + summary sin romper guardrails
  - Webhook dedupe existente no se rompe
  - `pnpm lint`, `pnpm test`, `pnpm db:migrate` pasan
- **Issue:** [#28](https://github.com/ferbbo/closy-bot/issues/28), [#29](https://github.com/ferbbo/closy-bot/issues/29), [#30](https://github.com/ferbbo/closy-bot/issues/30), [#31](https://github.com/ferbbo/closy-bot/issues/31), [#32](https://github.com/ferbbo/closy-bot/issues/32), [#33](https://github.com/ferbbo/closy-bot/issues/33), [#34](https://github.com/ferbbo/closy-bot/issues/34)
- **Brief:** `docs/plan/pr-briefs/PR-03.10-conversation-memory-retention.md` ✅

### PR-03.11 — Multi-channel per Merchant: Channel model + lookup + dynamic outbound 🔴 CRÍTICO
- **Objetivo:** permitir que cada Merchant tenga múltiples canales WhatsApp (y preparar Instagram), con resolución automática por `phone_number_id` y credenciales por canal.
- **Depende de:** PR-02 ✅, PR-03.9 ✅ (ambos MERGED).
- **Incluye:**
  - Modelo `Channel` (Prisma): `type`, `externalId`, `merchantId`, `credentials`, `displayName`, `isActive`
  - Enum `ChannelType { WHATSAPP, INSTAGRAM }`
  - `ChannelRepository`: `findByTypeAndExternalId()`, `findByMerchantId()`, `findById()`
  - `MerchantResolverService.resolveByChannel(type, externalId)` → `{ merchant, channel }` real (no `findFirst`)
  - FKs: `Conversation.channelId`, `OutboxMessage.channelId` (nullable para backwards compat)
  - `WhatsAppOutboundService.sendTextMessageWithCredentials(to, text, credentials)`
  - `OutboxDispatcher` usa credentials del channel (fallback a env vars si no hay channelId)
  - Unknown channel handling: log structured warning + 200 OK (sin crash)
  - Migración backwards-compatible: crea Channel desde Merchant + env vars existentes
  - Tests unit + e2e (multi-merchant multi-channel, channel desconocido)
- **Excluye:** UI admin para CRUD channels, Instagram OAuth completo, encrypt helper real, límites por plan.
- **DoD específico:**
  - Migración crea tabla `channels` + FKs en `conversations` y `outbox_messages`
  - Webhook inbound enruta al merchant correcto por `phone_number_id`
  - 2+ WhatsApps de diferente merchant funcionan simultáneamente
  - Channel desconocido → 200 OK + log structured sin crash
  - Outbound usa credentials del channel (no env vars globales)
  - Backwards compat: outbox messages sin `channelId` usan env vars
  - `pnpm lint`, `pnpm test`, `pnpm db:migrate` pasan
- **Brief:** `docs/plan/pr-briefs/PR-03.11-multi-channel-merchant.md`

### PR-04 — Carrito: CRUD conversacional persistido
- **Objetivo:** crear carrito por customer/merchant, agregar/remover/actualizar qty, y mostrar resumen.
- **Depende de:** PR-03.5 (PR-03.6 opcional pero recomendado).
- **Incluye:** modelos cart/cart_item + reglas básicas + endpoints/handlers internos.
- **Excluye:** checkout.

### PR-05 — Checkout: captura de datos mínimos + creación de orden
- **Objetivo:** iniciar checkout desde carrito, capturar nombre/dirección/ciudad y crear `order`.
- **Depende de:** PR-04.
- **Incluye:** order + order_items + estados `pending_payment` / `confirmed_cod`.
- **Excluye:** confirmación de pago por webhook.

### PR-06 — Pagos: webhook idempotente + fallback comando `PAGADO`
- **Objetivo:** confirmar pagos por webhook idempotente (`payment_intent_id`) y fallback `PAGADO`.
- **Depende de:** PR-05.
- **Incluye:** modelo payment + constraint unique + transición `order -> paid` exactamente una vez.
- **Excluye:** conciliación avanzada, múltiples proveedores complejos.
- **DoD específico:** webhook duplicado no duplica transiciones.

### PR-07 — Postventa: estado de pedido + tickets simples
- **Objetivo:** consultar estado de pedido y crear tickets (faltante/dañado/retraso) con evidencia opcional.
- **Depende de:** PR-06.
- **Incluye:** ticket model + endpoints/handlers + adjuntos mínimos.
- **Excluye:** SLA avanzado, workflows complejos.

### PR-08 — Handoff humano: resumen estructurado + registro
- **Objetivo:** detectar handoff y generar resumen con contexto (intención, carrito, paso, datos).
- **Depende de:** PR-07.
- **Incluye:** evento/tabla handoff + función de resumen + payload estructurado.
- **Excluye:** UI de inbox (puede quedar stub + persistencia).

### PR-09 — Carrito abandonado: 1–2 recordatorios con límites
- **Objetivo:** detectar abandono y enviar recordatorios (máx 2) respetando ventanas/horarios.
- **Depende de:** PR-06 (al menos checkout/pago) y PR-01 (outbound send).
- **Incluye:** job/scheduler mínimo + límites por conversación.
- **Excluye:** campañas masivas, segmentación avanzada.

### PR-10 — Analytics: eventos de embudo + endpoints mínimos
- **Objetivo:** emitir y persistir eventos del funnel y exponer métricas mínimas.
- **Depende de:** PR-06.
- **Incluye:** events schema + agregaciones básicas + endpoints admin internos.
- **Excluye:** dashboard frontend.

### PR-11 — Playbooks: ropa/belleza/minimarket (defaults)
- **Objetivo:** configurar defaults por industria (preguntas mínimas, mensajes base, reglas).
- **Depende de:** PR-02 (merchant), PR-03.6 (LLM prompts) y PR-04/05 (flows).
- **Incluye:** seed/config por playbook + selección por merchant + composición de prompts LLM.
- **Excluye:** editor visual avanzado.

---

## Cómo se usa este stack

1) Antes de construir `PR-XX`, el Planner crea un Brief en `docs/plan/pr-briefs/PR-XX-<slug>.md`.
2) El Builder implementa estrictamente el Brief (sin scope creep).
3) El Reviewer valida vs Brief y reglas del repo.
4) El Planner actualiza este stack si cambian dependencias/scope.
