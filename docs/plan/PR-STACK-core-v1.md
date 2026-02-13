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

### PR-04 — Carrito: CRUD conversacional persistido
- **Objetivo:** crear carrito por customer/merchant, agregar/remover/actualizar qty, y mostrar resumen.
- **Depende de:** PR-03.5.
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
- **Depende de:** PR-02 (merchant) y PR-04/05 (flows).
- **Incluye:** seed/config por playbook + selección por merchant.
- **Excluye:** editor visual avanzado.

---

## Cómo se usa este stack

1) Antes de construir `PR-XX`, el Planner crea un Brief en `docs/plan/pr-briefs/PR-XX-<slug>.md`.
2) El Builder implementa estrictamente el Brief (sin scope creep).
3) El Reviewer valida vs Brief y reglas del repo.
4) El Planner actualiza este stack si cambian dependencias/scope.
