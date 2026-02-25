# Brief — PR-08 — Handoff Humano: Resumen Estructurado + Registro

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-08-handoff-human.md`
> **Issue**: [#96](https://github.com/ferbbo/closy-bot/issues/96) (1 issue con todos los REQs)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Detectar necesidad de handoff (explícita o automática), generar resumen estructurado con contexto completo (intent, carrito, último paso, datos del cliente), y notificar al merchant vía WhatsApp. Detección es **template-first** (keyword + threshold). Summary LLM-assisted es **opt-in** (`LLM_SUMMARY_ENABLED=true`) con fallback deterministico.

## Scope fence

### ✅ Included

- Tabla `Handoff` (Prisma) con conversationId, reason, summary JSON, status enum
- `HandoffService` con detección, creación, y generación de summary dual (determinístico + LLM opt-in)
- Intent `HANDOFF` en IntentRouter con keywords (`hablar con alguien`, `quiero persona`, `atención humana`)
- Detección automática por escalation: 3+ intentos consecutivos de `UNKNOWN` en misma conversación
- Summary determinístico (default): construido desde DB (cart snapshot, lastIntent, metadata, últimos 3 mensajes)
- Summary LLM-assisted (opt-in): si `LLM_SUMMARY_ENABLED=true`, genera `conversationHighlights` natural con LLM
- Notificación merchant vía WhatsApp con resumen
- Activación de `handoffActive=true` en Conversation (integra con PR-05.2 relay)
- `HandoffFlow` template-first para manejo de intent `HANDOFF` y escalation
- Tests unit + e2e

### ❌ Excluded

- UI inbox o dashboard de handoffs
- Assignment manual a agentes específicos
- SLA tracking o priority levels
- Historial de cambios de handoff status
- Edición de summary post-creación
- Handoff automático por tiempo de respuesta
- Re-abrir handoffs cerrados

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear tabla `Handoff` para persistir handoffs con status, reason, summary JSON | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-01 |
| REQ-02 | Implementar `HandoffService` con métodos `detectHandoff()`, `createHandoff()`, `generateSummary()` | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-02, AC-03, AC-04, AC-10 |
| REQ-03 | Agregar intent `HANDOFF` al IntentRouter con keywords (hablar persona, atención humana) | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-05 |
| REQ-04 | Implementar detección automática por escalation: 3+ loops UNKNOWN consecutivos | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-06 |
| REQ-05 | Generar summary determinístico desde DB: cart, intent, step, customer info, últimos 3 mensajes | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-07 |
| REQ-06 | Generar summary LLM-assisted si `LLM_SUMMARY_ENABLED=true` (conversationHighlights naturales) | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-08 |
| REQ-07 | Notificar merchant vía WhatsApp con resumen estructurado usando `MerchantNotificationService` | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-09 |
| REQ-08 | Activar `handoffActive=true` en Conversation al crear handoff (integra relay PR-05.2) | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-10 |
| REQ-09 | Crear `HandoffFlow` que maneja intent `HANDOFF` y escalation con mensajes del playbook | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-11 |
| REQ-10 | Agregar `handoffMessages` en PlaybookConfig interface para personalizar mensajes | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-12 |
| REQ-11 | Actualizar industry presets con defaults de handoff messages | [#96](https://github.com/ferbbo/closy-bot/issues/96) | AC-13 |

> **Nota**: Todos los REQs apuntan al mismo issue (#96).

## Paths a tocar (concretos)

- `prisma/schema.prisma` (nueva tabla `Handoff` + enum `HandoffStatus`, extensión PlaybookConfig)
- `prisma/migrations/YYYYMMDDHHMMSS_pr_08_handoff/migration.sql` (migración)
- `apps/api/src/services/handoff.service.ts` (nuevo)
- `apps/api/src/services/handoff.service.spec.ts` (tests unit)
- `apps/api/src/orchestrator/flows/handoff.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/handoff.flow.spec.ts` (tests unit)
- `apps/api/src/orchestrator/intent/keyword-configs.ts` (agregar `HANDOFF` intent)
- `apps/api/src/orchestrator/types/intent.types.ts` (agregar `'HANDOFF'` a IntentKey union)
- `apps/api/src/orchestrator/conversation.orchestrator.ts` (integrar HandoffFlow, track UNKNOWN loops)
- `apps/api/src/services/playbook.service.ts` (extender interface PlaybookConfig.handoffMessages)
- `apps/api/src/common/config/industry-presets/*.config.ts` (defaults handoff messages)
- `apps/api/test/handoff-flow.e2e-spec.ts` (e2e tests)
- `.env.example` (documentar `LLM_SUMMARY_ENABLED`)
- `docs/BACKEND-EXECUTION-GUIDE.md` (actualizar estado de handoff)

## Contratos / Interfaces

### Prisma Models (schema.prisma)

| Model | Field | Type | Constraints | Description |
|-------|-------|------|-------------|-------------|
| **Handoff** | id | String | @id @default(cuid()) | ID único del handoff |
| | conversationId | String | | FK a Conversation |
| | reason | String | | Razón del handoff: "user_request" \| "auto_escalation" |
| | summaryJson | Json | | Summary estructurado (ver HandoffSummary) |
| | status | HandoffStatus | @default(pending) | pending \| active \| resolved |
| | createdAt | DateTime | @default(now()) | Timestamp creación |
| | updatedAt | DateTime | @updatedAt | Timestamp última actualización |
| | conversation | Conversation | @relation | Relación con conversación |

| Enum | Values | Description |
|------|--------|-------------|
| **HandoffStatus** | pending, active, resolved | Estados del handoff |

### HandoffSummary JSON Structure

| Field | Type | Description |
|-------|------|-------------|
| intent | string | Último intent detectado (lastIntent) |
| cartSnapshot | object[] | Array de items en carrito activo (productName, qty, price) |
| currentStep | string \| null | Paso actual si hay flow activo (ej: checkout.step, post_sale.step) |
| customerInfo | object | { name?, phone } del Customer |
| conversationHighlights | string | Resumen natural de los últimos mensajes (3 por default, o LLM-generated) |
| metadata | object | Cualquier metadata adicional de Conversation |

### HandoffService Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| `detectHandoff()` | conversationId, messageText, context | Promise\<boolean\> | Detecta si se debe crear handoff (keyword match o escalation) |
| `createHandoff()` | conversationId, reason, merchant | Promise\<Handoff\> | Crea Handoff + genera summary + activa handoffActive + notifica merchant |
| `generateSummary()` | conversationId, merchantPlaybookData, llmEnabled | Promise\<HandoffSummary\> | Genera summary determinístico o LLM-assisted |
| `updateStatus()` | handoffId, status | Promise\<Handoff\> | Actualiza status del handoff (future-proof, no usado en V1) |

### PlaybookConfig Extension (handoffMessages)

| Field | Type | Description |
|-------|------|-------------|
| handoffMessages.requestReceived | string | `"Entiendo, te conecto con una persona. Un momento..."` |
| handoffMessages.escalationDetected | string | `"Veo que necesitas ayuda específica. Te conecto con nuestro equipo."` |
| handoffMessages.merchantNotification | string | Template con placeholders `{customerName}`, `{summary}` |

### IntentRouter Addition

| Intent | Keywords | Confidence Threshold |
|--------|----------|---------------------|
| **HANDOFF** | `hablar con alguien`, `quiero persona`, `atención humana`, `hablar persona`, `atención`, `agente`, `representante`, `ayuda`, `no entiendo` | score > 2 → HIGH |

### Feature Flag

| Env Var | Type | Default | Description |
|---------|------|---------|-------------|
| `LLM_SUMMARY_ENABLED` | boolean | `false` | Si true, usa LLM para generar conversationHighlights natural. Si false, usa últimos 3 mensajes como string simple |

## Comportamiento

### Happy path (explicit handoff)

1. Cliente envía "quiero hablar con alguien"
2. IntentRouter detecta intent `HANDOFF` con confidence HIGH
3. Orchestrator llama `handoffFlow.handle()`
4. HandoffFlow llama `handoffService.createHandoff()` con reason `"user_request"`
5. HandoffService:
   - Genera summary determinístico (cart, intent, step, últimos 3 mensajes)
   - Si `LLM_SUMMARY_ENABLED=true`: genera conversationHighlights con LLM
   - Guarda Handoff en DB con status `pending`
   - Actualiza `conversation.handoffActive = true`
   - Notifica merchant vía `merchantNotificationService.notifyHandoff()`
6. HandoffFlow responde al cliente con playbook message `handoffMessages.requestReceived`
7. Merchant recibe WhatsApp: `"🔔 Se requiere atención humana\n\nCliente: [nombre]\nÚltimo intent: [intent]\nCarrito: [items]\nResumen: [highlights]"`

### Happy path (auto-escalation)

1. Cliente envía 3 mensajes consecutivos sin resolución → intent `UNKNOWN` 3 veces
2. Orchestrator detecta escalation threshold (track counter en memoria o metadata)
3. Orchestrator llama `handoffService.detectHandoff()` → returns `true`
4. Orchestrator llama `handoffFlow.handle()` con reason `"auto_escalation"`
5. HandoffService:
   - Genera summary (igual proceso que explicit)
   - Guarda Handoff con status `pending`
   - Activa `handoffActive`
   - Notifica merchant
6. HandoffFlow responde con `handoffMessages.escalationDetected`
7. Merchant recibe notificación

### Edge cases

- **Duplicados**: Si ya existe Handoff con status `pending` o `active` para conversación → no crea nuevo, retorna existente
- **LLM summary falla**: si `LLM_SUMMARY_ENABLED=true` pero LLM falla/timeout → fallback a determinístico (últimos 3 mensajes plain)
- **Sin carrito activo**: `cartSnapshot` = `[]` (vacío), summary indica "sin carrito activo"
- **Sin lastIntent**: `intent` = `"UNKNOWN"`, summary funciona igual
- **handoffActive ya true**: si relay activado manualmente (PR-05.2) antes de crear Handoff → no redunda, Handoff creation es idempotente por conversationId+status

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Migración crea tabla `Handoff` con todos los campos y relación a `Conversation` | test: `describe('PR-08 schema')` ejecuta prisma query |
| AC-02 | `handoffService.detectHandoff()` retorna `true` para keywords intent `HANDOFF` | test: `handoff.service.spec.ts` |
| AC-03 | `handoffService.detectHandoff()` retorna `true` cuando counter UNKNOWN >= 3 | test: `handoff.service.spec.ts` |
| AC-04 | `handoffService.createHandoff()` crea registro + activa handoffActive + notifica merchant | test: `handoff.service.spec.ts` + e2e |
| AC-05 | IntentRouter reconoce `"quiero hablar con alguien"` → intent `HANDOFF` confidence HIGH | test: `intent-router.spec.ts` (extender existente) |
| AC-06 | Orchestrator trackea UNKNOWN loops y trigger auto-escalation después de 3 | test: e2e `handoff-flow.e2e-spec.ts` |
| AC-07 | Summary determinístico incluye: intent, cartSnapshot, step, customerInfo, últimos 3 mensajes | test: `handoff.service.spec.ts` |
| AC-08 | Con `LLM_SUMMARY_ENABLED=true`, summary incluye conversationHighlights generado por LLM | test: e2e con flag activo |
| AC-09 | Merchant recibe WhatsApp con resumen estructurado (formato template de playbook) | test: e2e verifica OutboxMessage creado |
| AC-10 | `conversation.handoffActive = true` después de `createHandoff()` | test: e2e verifica campo actualizado |
| AC-11 | `HandoffFlow.handle()` responde con mensaje correcto según reason (explicit vs escalation) | test: `handoff.flow.spec.ts` |
| AC-12 | PlaybookConfig interface extendida con `handoffMessages` y validado con DTO | test: unit validación DTO |
| AC-13 | Industry presets (ropa, belleza, minimarket) incluyen defaults de handoff messages | test: verificar archivos preset actualizados |
| AC-14 | Handoff idempotente: no crea duplicado si ya existe pending/active para conversación | test: e2e intenta crear 2x |
| AC-15 | LLM summary fallback: si LLM falla, usa determinístico sin crash | test: mock LLM error |

## Plan de pruebas

### Unit tests

**handoff.service.spec.ts:**
- `detectHandoff()` con keyword match → true
- `detectHandoff()` con escalation counter >= 3 → true
- `generateSummary()` crea summary determinístico completo
- `generateSummary()` con LLM enabled llama LlmService correctamente
- `createHandoff()` crea registro + actualiza conversation.handoffActive
- Idempotencia: `createHandoff()` second call retorna existente si pending/active

**handoff.flow.spec.ts:**
- `handle()` con reason "user_request" → mensaje requestReceived
- `handle()` con reason "auto_escalation" → mensaje escalationDetected
- Llama `handoffService.createHandoff()` correctamente

**intent-router.spec.ts (extender):**
- Intent `HANDOFF` reconocido para keywords relevantes

### Integration/e2e tests

**handoff-flow.e2e-spec.ts:**
- **AC-04 E2E**: cliente envía "quiero hablar con alguien" → Handoff creado + merchant notificado
- **AC-06 E2E**: cliente envía 3 UNKNOWN consecutivos → escalation trigger → Handoff creado
- **AC-08 E2E**: con `LLM_SUMMARY_ENABLED=true` → summary incluye conversationHighlights generado por LLM
- **AC-09 E2E**: verifica OutboxMessage para merchant con template correcto
- **AC-14 E2E**: segundo intento de handoff en misma conversación no crea duplicado

### Manual testing (pre-merge)

- Configurar `LLM_SUMMARY_ENABLED=false` → summary determinístico funciona
- Configurar `LLM_SUMMARY_ENABLED=true` → summary usa LLM y fallback funciona si LLM falla
- Verificar merchant recibe notificación WhatsApp con formato legible

## DoD

- [x] Todos los AC tienen evidencia
- [x] Sin scope creep (solo lo del brief)
- [x] Estado persistido en Postgres (`Handoff` table)
- [x] Idempotencia implementada (no duplica handoff para conversación pending/active)
- [x] Guardrails: summary NO usa LLM para inventar datos de negocio (solo highlight conversacional)
- [x] PII minimizada: summary incluye solo phone (masked en logs), sin logging de texto completo en aplicación
- [x] `pnpm lint` y `pnpm test` pasan
- [x] Migración DB incluida
- [x] `.env.example` actualizado con `LLM_SUMMARY_ENABLED`
- [x] `BACKEND-EXECUTION-GUIDE.md` actualizado con estado de handoff
- [x] Summary incluye datos reales desde DB, NO inventados
- [x] LLM fallback funcional (si enabled pero falla, usa determinístico)

## Constraints

- **Guardrails**: LLM solo genera `conversationHighlights` natural (summary de conversación), NO inventa precio/stock/estado de pedido.
- **PII**: phone enmascarado en logs de aplicación. Summary incluye phone real solo en notificación al merchant.
- **Idempotencia**: no crear múltiples Handoffs pending/active para misma conversación.
- **Template-first**: Detección es determinística (keywords + threshold). LLM solo para enriquecer summary si opt-in.

## Riesgos y mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| LLM summary timeout en producción | Alto (bloquea handoff si no hay fallback) | Media | Fallback determinístico automático con timeout 5s |
| UNKNOWN loop counter no se limpia | Bajo (escalation repetida) | Baja | Counter se resetea al detectar cualquier intent != UNKNOWN |
| Summary demasiado largo para WhatsApp | Medio (notificación truncada) | Media | Limitar conversationHighlights a 500 chars max |
| Merchant no tiene phone configurado | Alto (notificación falla) | Baja | Log warning + Handoff creado igual (future-proof para UI inbox) |
| Handoff creado pero relay no activado | Alto (merchant no puede responder) | Baja | Test e2e verifica `handoffActive=true` |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| - | - | - |

