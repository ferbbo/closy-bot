# Brief — PR-OB-01 — Onboarding Wizard API: Progress Tracker + Presets + Activación

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-OB-01-onboarding-wizard-api.md`
> **Issue**: [#98](https://github.com/ferbbo/closy-bot/issues/98) (1 issue con todos los REQs)
> **Parallel Mode**: `false` (default)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear API backend que guía al merchant durante el setup inicial del bot, trackeando progreso dinámicamente (sin tabla extra) y aplicando presets por industria (PlaybookConfig + MerchantConfig) para acelerar configuración. Incluye endpoint de activación que valida requisitos mínimos antes de habilitar el bot.

## Scope fence

### ✅ Included

- Nuevo módulo `onboarding/` con endpoints:
  - `GET /onboarding/progress` → calcula progreso de setup dinámicamente
  - `POST /onboarding/apply-preset` → aplica preset de industria
  - `POST /onboarding/activate` → valida y activa merchant
- `OnboardingService` con lógica de:
  - Cálculo dinámico de steps (profile, channel, catalog, config, test)
  - Aplicación de presets por industria (ropa/belleza/minimarket)
  - Validación de requisitos mínimos pre-activación
- Campo `Merchant.status` (enum: `onboarding` | `active` | `paused`)
- Migration para agregar campo `status` con default `onboarding`
- Validación en `ConversationOrchestrator`: si `merchant.status !== 'active'` → respuesta "Tienda en configuración" (no procesa mensajes de clientes)
- DTOs con `class-validator` para request/response
- Guard: `SessionAuthGuard` (auth por cookie, consistente con PR-15)
- Tests unit (service) + e2e (endpoints)
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL examples

### ❌ Excluded

- UI wizard frontend (PR-FE-OB)
- Tabla separada para tracking de progreso (se calcula dinámicamente)
- Gamification (badges, progress bar animado)
- Onboarding conversacional por WhatsApp (V1 solo dashboard)
- Historiales de cambio de status
- Notificaciones de progreso (email/WhatsApp)
- Multiple admins / roles (V1 solo owner)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Endpoint `GET /onboarding/progress` calcula steps dinámicamente desde DB | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-01, AC-02 |
| REQ-02 | `OnboardingService` con métodos: `getProgress()`, `applyPreset()`, `activate()` | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-03 |
| REQ-03 | Endpoint `POST /onboarding/apply-preset` aplica PlaybookConfig + MerchantConfig | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-04, AC-05 |
| REQ-04 | Endpoint `POST /onboarding/activate` valida mínimos y cambia `Merchant.status` | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-06, AC-07 |
| REQ-05 | Campo `Merchant.status` con enum y default `onboarding` | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-08 |
| REQ-06 | `ConversationOrchestrator` valida `merchant.status` antes de procesar | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-09 |
| REQ-07 | Tests unit + e2e para todos endpoints y validaciones | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-10, AC-11 |
| REQ-08 | Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL examples | [#98](https://github.com/ferbbo/closy-bot/issues/98) | AC-12 |

## Paths a tocar (concretos)

```
prisma/
  schema.prisma                                # UPDATE: add Merchant.status enum
  migrations/
    YYYYMMDDHHMMSS_add_merchant_status/
      migration.sql                            # NEW

apps/api/src/
  onboarding/
    onboarding.controller.ts                   # NEW
    onboarding.service.ts                      # NEW
    dto/
      onboarding-progress.response.dto.ts      # NEW
      apply-preset.request.dto.ts              # NEW
      activate-merchant.response.dto.ts        # NEW
    onboarding.controller.spec.ts              # NEW
    onboarding.service.spec.ts                 # NEW
    onboarding.module.ts                       # UPDATE: add controller/service
  orchestrator/
    conversation.orchestrator.ts               # UPDATE: add status validation
    conversation.orchestrator.spec.ts          # UPDATE: add tests
  app.module.ts                                # (OnboardingModule ya importado en PR-13)

test/
  onboarding.e2e-spec.ts                       # NEW

docs/
  BACKEND-EXECUTION-GUIDE.md                   # UPDATE: add Flujo Onboarding
```

## Contratos / Interfaces

### Endpoints

#### GET /onboarding/progress

| Campo | Valor |
|-------|-------|
| **Auth** | Required (SessionAuthGuard) |
| **Response 200** | `OnboardingProgressResponseDto` |
| **Response 401** | `{ statusCode: 401, message: "Unauthorized" }` |

**Response structure:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `completedSteps` | `string[]` | Steps completados: `profile`, `channel`, `catalog`, `config`, `test` |
| `pendingSteps` | `string[]` | Steps faltantes |
| `percentage` | `number` | % progreso (0-100) |
| `nextStep` | `string \| null` | Siguiente step sugerido |

**Step definitions:**
| Step | Condición para marcar como completado |
|------|--------------------------------------|
| `profile` | `merchant.name` no vacío AND `merchant.industry` no null |
| `channel` | Existe ≥1 `Channel` con `isActive=true` para el merchant |
| `catalog` | Existe ≥1 `Product` para el merchant |
| `config` | `MerchantConfig.paymentMethods` tiene ≥1 método configurado |
| `test` | Existe ≥1 `InboundMessage` processado para el merchant (test exitoso) |

#### POST /onboarding/apply-preset

| Campo | Valor |
|-------|-------|
| **Auth** | Required (SessionAuthGuard) |
| **Body** | `ApplyPresetRequestDto` |
| **Response 200** | `{ success: true }` |
| **Response 400** | Validation error (industry inválida) |
| **Response 401** | Unauthorized |

**Request body:**
| Campo | Tipo | Validación |
|-------|------|-----------|
| `industry` | `'ropa' \| 'belleza' \| 'minimarket'` | `@IsEnum(Industry)` |

**Comportamiento:**
- Actualiza `Merchant.industry`
- Aplica `PlaybookConfig` defaults de la industria (via `PlaybookService.getIndustryDefaults()`)
- Aplica `MerchantConfig` defaults de la industria (via `MerchantConfigService.getOrCreateConfig()`)
- Operación idempotente (aplicar mismo preset múltiples veces = mismo resultado)

#### POST /onboarding/activate

| Campo | Valor |
|-------|-------|
| **Auth** | Required (SessionAuthGuard) |
| **Response 200** | `{ activated: true, status: 'active' }` |
| **Response 400** | `{ error: 'Missing requirements', details: string[] }` (lista de steps faltantes) |
| **Response 401** | Unauthorized |

**Validación pre-activación:**
- Step `channel` completado (≥1 channel activo)
- Step `catalog` completado (≥1 product)
- Step `config` completado (≥1 payment method)
- Steps `profile` y `test` son opcionales para activación (soft requirements)

**Comportamiento:**
- Si validación OK → cambia `Merchant.status` a `active`
- Si validación falla → retorna 400 con detalles de requisitos faltantes
- Operación idempotente (activar merchant ya activo = 200 OK)

### DTOs

**OnboardingProgressResponseDto:**
```typescript
export class OnboardingProgressResponseDto {
  completedSteps!: string[];
  pendingSteps!: string[];
  percentage!: number; // 0-100
  nextStep!: string | null;
}
```

**ApplyPresetRequestDto:**
```typescript
export class ApplyPresetRequestDto {
  @IsEnum(Industry)
  industry!: 'ropa' | 'belleza' | 'minimarket';
}
```

**ActivateMerchantResponseDto:**
```typescript
export class ActivateMerchantResponseDto {
  activated!: boolean;
  status!: 'active' | 'onboarding';
  missingRequirements?: string[]; // Solo si activated=false
}
```

### Persistencia

**Migration: add Merchant.status**
| Campo | Tipo | Default | Constraint |
|-------|------|---------|------------|
| `status` | `enum ('onboarding', 'active', 'paused')` | `'onboarding'` | NOT NULL |

**Enum en Prisma:**
```prisma
enum MerchantStatus {
  onboarding
  active
  paused
}
```

### Idempotencia

- `applyPreset()`: idempotente por naturaleza (aplicar mismo preset = mismo state final)
- `activate()`: idempotente (activar merchant activo = no-op, retorna 200)
- `getProgress()`: read-only, no aplica idempotencia

## Comportamiento

### Happy path

1. Merchant se registra → `Merchant.status = 'onboarding'` (default)
2. `GET /onboarding/progress` → retorna steps pendientes (todos excepto `profile` si completó signup)
3. Merchant aplica preset: `POST /onboarding/apply-preset { "industry": "ropa" }`
   - PlaybookConfig actualizado con defaults de ropa
   - MerchantConfig actualizado con paymentMethods/shippingConfig defaults
4. Merchant completa connectar WhatsApp (PR-13) → step `channel` completado
5. Merchant sube catálogo (PR-17) → step `catalog` completado
6. Merchant configura payment methods (o ya viene de preset) → step `config` completado
7. `POST /onboarding/activate` → validación OK → `Merchant.status = 'active'`
8. Bot empieza a responder mensajes de clientes (Orchestrator valida `status === 'active'`)

### Edge cases

#### Activar merchant sin requisitos mínimos
- **Input:** `POST /onboarding/activate` pero no tiene channel conectado
- **Output:** 400 con `{ "error": "Missing requirements", "details": ["channel", "catalog"] }`

#### Merchant activo recibe mensaje
- **Before:** Bot procesa y responde
- **No change:** Sigue procesando (Orchestrator check `status === 'active'` ✅)

#### Merchant onboarding recibe mensaje
- **Input:** Cliente envía mensaje a WhatsApp de merchant en onboardingOrchestrator verifica `merchant.status !== 'active'`
- **Output:** Bot responde: "Tienda en configuración. Por favor intenta más tarde." (mensaje del playbook)
- **No procesa flows** (no intent classification, no cart, no LLM calls)

#### Aplicar preset múltiples veces
- **Input:** `POST /onboarding/apply-preset { "industry": "ropa" }` × 2
- **Output:** Ambos requests retornan 200. State final = preset de ropa aplicado (idempotente)

#### Activar merchant ya activo
- **Input:** `POST /onboarding/activate` pero `merchant.status === 'active'`
- **Output:** 200 con `{ "activated": true, "status": "active" }` (no-op, idempotente)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `GET /onboarding/progress` calcula steps dinámicamente sin tabla extra | Unit test: `OnboardingService.getProgress()` consulta `Merchant`, `Channel`, `Product`, `MerchantConfig` y retorna steps correctos |
| AC-02 | Progress percentage calculado correctamente (5 steps × 20% each) | Unit test: merchant con 3/5 steps → `percentage: 60` |
| AC-03 | `OnboardingService` tiene métodos `getProgress()`, `applyPreset()`, `activate()` | Test: service instancia correctamente + métodos existen |
| AC-04 | `POST /onboarding/apply-preset` actualiza `Merchant.industry` y `playbookConfig` | E2E test: aplicar preset ropa → merchant tiene PlaybookConfig de ropa |
| AC-05 | Preset aplica `MerchantConfig` defaults (payment methods, shipping) | E2E test: aplicar preset belleza → `MerchantConfig` tiene métodos de pago defaults |
| AC-06 | `POST /onboarding/activate` valida requisitos mínimos (channel, catalog, config) | E2E test: activar sin channel → 400 con `missingRequirements: ["channel"]` |
| AC-07 | `activate()` cambia `Merchant.status` a `active` cuando validación OK | E2E test: merchant con channel + catalog + config → activate → `status='active'` |
| AC-08 | Campo `Merchant.status` existe con enum y default `onboarding` | Migration test: crear nuevo merchant → `status='onboarding'` por default |
| AC-09 | `ConversationOrchestrator` rechaza mensajes si `merchant.status !== 'active'` | Unit test: orchestrator con merchant onboarding → retorna mensaje "Tienda en configuración" sin procesar intent |
| AC-10 | Tests unit para `OnboardingService` cubren todos métodos y edge cases | Test coverage: `OnboardingService` ≥90% lines |
| AC-11 | Tests e2e cubren flujo completo: apply preset → progress → activate | E2E test: `describe('Onboarding flow')` |
| AC-12 | `BACKEND-EXECUTION-GUIDE.md` actualizado con cURL examples para 3 endpoints | Doc: Flujo "Onboarding Wizard" con ejemplos copy-paste ready |

## Plan de pruebas

### Unit tests

**OnboardingService:**
- `getProgress()` con diferentes combinaciones de steps completados
- `applyPreset()` con industry ropa/belleza/minimarket
- `activate()` con requisitos completos / incompletos
- Edge case: merchant sin `MerchantConfig` (lazy-create en `activate()`)

**ConversationOrchestrator:**
- Merchant con `status='onboarding'` → mensaje rechazado
- Merchant con `status='active'` → mensaje procesado normalmente
- Merchant con `status='paused'` → mensaje rechazado (similar a onboarding)

### Integration (e2e)

**Scenario 1: Flujo happy path completo**
```typescript
it('should complete onboarding flow', async () => {
  // 1. GET /onboarding/progress → all pending
  // 2. POST /onboarding/apply-preset { industry: 'ropa' }
  // 3. (simular: connect channel, upload catalog)
  // 4. GET /onboarding/progress → verify completedSteps
  // 5. POST /onboarding/activate → 200, status='active'
});
```

**Scenario 2: Activar sin requisitos mínimos**
```typescript
it('should reject activation without minimum requirements', async () => {
  // 1. Merchant nuevo (solo profile)
  // 2. POST /onboarding/activate → 400 con missingRequirements
});
```

**Scenario 3: Bot no procesa si merchant onboarding**
```typescript
it('should reject customer messages if merchant not active', async () => {
  // 1. Merchant con status='onboarding'
  // 2. POST /webhooks/whatsapp (inbound message)
  // 3. Verify: outbox message = "Tienda en configuración"
  // 4. Verify: no intent classification, no cart, no LLM call
});
```

### Manual (opcional)

- cURL smoke test: seguir ejemplos de `BACKEND-EXECUTION-GUIDE.md`
- Validar con Postman collection (si existe)

## DoD

- [ ] Todos los AC tienen evidencia (test names + resultados)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (`Merchant.status`)
- [ ] Idempotencia implementada (`applyPreset`, `activate`)
- [ ] Guardrails: bot NO procesa mensajes si merchant no está active
- [ ] PII minimizada (no aplica — no se maneja PII en este PR)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migration `add_merchant_status` incluida y testeada
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con cURL examples
- [ ] **API Consumer-First:**
  - [ ] cURL examples son copy-paste ready (session cookie válida)
  - [ ] Auth method consistente (`SessionAuthGuard`) con PR-15
  - [ ] Error responses accionables (400 con `missingRequirements` array)
  - [ ] Progress response tiene `nextStep` sugerido para guiar UI

## Consumer experience

**From dashboard UI (PR-FE-OB):**
- Página `/onboarding` consume `GET /onboarding/progress` para mostrar stepper
- Botón "Aplicar preset de Ropa" → `POST /onboarding/apply-preset { "industry": "ropa" }`
- Botón "Activar tienda" → `POST /onboarding/activate`
  - Si success → redirect a `/dashboard`
  - Si error → mostrar lista de requisitos faltantes

**From cURL (testing/debugging):**
```bash
# 1. Get progress
curl -X GET https://api.closy.bot/onboarding/progress \
  -H "Cookie: session_id=<session_cookie>" \
  | jq

# 2. Apply preset
curl -X POST https://api.closy.bot/onboarding/apply-preset \
  -H "Cookie: session_id=<session_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"industry":"ropa"}' \
  | jq

# 3. Activate
curl -X POST https://api.closy.bot/onboarding/activate \
  -H "Cookie: session_id=<session_cookie>" \
  | jq
```

## Constraints

- **No LLM:** Este módulo NO usa LLM (cálculo determinístico desde DB)
- **No external APIs:** No integraciones externas en este PR
- **Progreso no persistido:** Se calcula on-demand, no stored (para V1)
- **Steps hardcoded:** Los 5 steps son fijos (no configurables por merchant)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Cálculo de progreso lento (N+1 queries) | Media | Bajo | Usar Prisma `include` para eager-load relaciones en 1 query |
| Merchant activa sin catalog real (solo dummy) | Media | Medio | Validación en `activate()` verifica ≥1 product (no valida calidad) |
| Race condition: activar durante channel setup | Baja | Medio | `activate()` revalida requisitos antes de cambiar status |
| Preset sobrescribe config custom | Media | Alto | `applyPreset()` solo actualiza si `playbookConfig` es null (primera vez) |

**Mitigación del último riesgo (preset override):**
- `applyPreset()` verifica si `merchant.playbookConfig` ya existe
- Si existe → solo actualiza `industry` field, NO sobrescribe config completo
- Si no existe → aplica preset full
- Así merchant puede personalizar config post-preset sin perderlo

## Tech notes

- **Progreso calculado, no stored:** `getProgress()` ejecuta queries a `Merchant`, `Channel`, `Product`, `MerchantConfig` en cada call. Para V1 (volumen bajo) es aceptable. Si escala → considerar cache Redis.
- **Preset = merge:** `applyPreset()` usa `PlaybookService.getIndustryDefaults()` existente + deep merge sobre `playbookConfig`.
- **Orchestrator check:** Agregar early-return en `ConversationOrchestrator.handleInboundMessage()`:
  ```typescript
  if (merchant.status !== 'active') {
    await this.outboundService.sendMessage(merchant.id, from, 
      'Tienda en configuración. Por favor intenta más tarde.');
    return;
  }
  ```
- **Session auth:** Reusa `SessionAuthGuard` de PR-12 (consistente con PR-15, PR-16).

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
