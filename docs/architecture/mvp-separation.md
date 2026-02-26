# MVP/B2 Separation Strategy

> Documento de decisión arquitectónica para la separación MVP (Core V1) vs B2 (features avanzadas)
>
> **Fecha:** 2026-02-26  
> **Estado:** APROBADO  
> **Autor:** Architect Agent

---

## 1. Understanding

### 1.1 Problema
El código actual mezcla features MVP y B2 sin una separación clara. Necesitamos:
1. Lanzar un MVP vendible rápidamente ("tienda en 10 minutos")
2. Preservar el trabajo de B2 sin perderlo
3. Mantener el flujo `dev → main` con WorkTree sin conflictos
4. Asegurar que `main` represente siempre "QA MVP limpio"

### 1.2 In-Scope
- Estrategia de separación MVP/B2 con implementación concreta
- Feature flags + kill-switch para gating server-side y frontend
- Reglas operativas para agentes (`dev` y `main`)
- PR-STACK actualizado con prioridades ajustadas
- Documentación de operación

### 1.3 Out-of-Scope
- Implementación completa de features pendientes (eso es del Builder)
- CRM, pipelines, marketing automation (fuera de MVP)
- **Verticales por industria (ropa/belleza/minimarket)** — MVP usa "Retail General" único (B2)
- Multi-vertical avanzado / editor de playbooks (B2)
- Instagram / Webchat channels (B2)

### 1.4 Supuestos
1. No hay usuarios en producción aún
2. El código B2 existente es mínimo y bien encapsulado
3. El Wizard de Onboarding está parcialmente implementado
4. Los PRs del Bloque 1 y 2 (Pedidos + Operación) están casi completos

---

## 2. Auditoría del Estado Actual

### 2.1 PRs Mergeados (en `dev`)

| Bloque | PRs Completados | Status |
|--------|-----------------|--------|
| Infra | PR-01 a PR-14 (core) | ✅ Mergeados |
| Bloque 1 (Pedidos) | PR-04, PR-03.5.1/2, PR-GAP-1, PR-GAP-2, PR-04.5, PR-05, PR-05.1, PR-05.2, PR-06 | ✅ Mergeados |
| Bloque 2 (Operación) | PR-07, PR-08 | ✅ Mergeados |
| Bloque 3 (Dashboard Base) | PR-FE-00, PR-FE-01, PR-15, PR-16, PR-17 | ✅ Mergeados |
| Bloque 4 (Onboarding) | PR-OB-01, PR-FE-OB | ✅ Mergeados |
| Playbooks | PR-11, PR-GAP-1 | ✅ Mergeados |

### 2.2 PRs Pendientes para MVP

| PR | Descripción | Prioridad |
|----|-------------|-----------|
| PR-MVP-01 | Feature Flags Infrastructure | P0 BLOCKER |
| PR-FE-OB-2 | Wizard: step-customize (pagos + políticas + FAQs) | P0 |
| PR-FE-03 | Channels UI | P1 |
| PR-FE-04 | Catalog UI | P1 |
| PR-FE-05 | Settings UI | P1 |
| PR-FE-06 | Orders UI ("Torre de Control") | P1 |

> **🎉 Estado:** El core backend está **COMPLETO**. Solo faltan las UIs del dashboard (Bloque 5).

### 2.3 Features B2 Identificadas (código existente)

| Feature | Ubicación | Estado | Acoplamiento |
|---------|-----------|--------|--------------|
| Multi-channel per merchant | `Channel` model, `ChannelType` enum | Estructura existe | **BAJO** - Solo WhatsApp funcional |
| Instagram channel | `ChannelType.INSTAGRAM` enum | Solo enum | **NULO** - Sin implementación |
| Verticales/Industries | `Industry` enum, `playbookConfig` | Implementado | **B2** - MVP usa "Retail General" único |
| PlaybookConfig personalizable | `Merchant.playbookConfig` JSON | Básico | **MVP** - Edición simple OK (con preset retail) |
| TemplatePack en DB | No implementado (Bloque 7) | — | **N/A** |
| Editor playbook avanzado | No implementado | — | **N/A** |

### 2.4 Conclusión de Auditoría

**El código B2 existente es mínimo:**
- `ChannelType.INSTAGRAM` existe como enum pero sin OAuth/handler
- Multi-channel está preparado pero UI solo muestra 1 WhatsApp
- Verticales (ropa/belleza/minimarket) existen pero **se ocultan en MVP** — se usa "Retail General" único
- No hay código de TemplatePack/editor avanzado (Bloque 7 no iniciado)

**Decisión de producto: MVP = Retail General**
- Un solo preset "retail general" bien pulido para validar rápido
- Sin selector de industria en wizard (simplifica UX)
- Verticales específicas se habilitan en B2 tras validar mercado

**Riesgo de acoplamiento: BAJO**

### 2.5 Wizard MVP — Estructura de 4 Pasos

El wizard de onboarding debe garantizar "tienda lista en 10 minutos" con personalización mínima viable.

> **Decisión:** Eliminamos step-profile porque:
> - `merchantName` y `merchantEmail` ya vienen del login OIDC (read-only)
> - El selector de industria se eliminó (MVP = "Retail General" fijo)
> - Menos fricción = setup más rápido

#### Pasos del Wizard MVP

| # | Step | Archivo | Estado | Descripción |
|---|------|---------|--------|-------------|
| 1 | **channel** | `step-channel.tsx` | ✅ Existe | Vincular WhatsApp via Meta Embedded Signup |
| 2 | **catalog** | `step-catalog.tsx` | ✅ Existe | Importar catálogo CSV o manual |
| 3 | **customize** | `step-customize.tsx` | ❌ NUEVO | **Pagos + Políticas + FAQs** (paso de personalización) |
| 4 | **activate** | `step-activate.tsx` | ✅ Existe | Resumen + botón activar |

> **Nota:** `step-profile.tsx` y `step-payments.tsx` se eliminan o deprecan. Sus funcionalidades se absorben en el nuevo flujo.

#### NUEVO: step-customize (PR-FE-OB-2)

**Objetivo:** Paso único de personalización que combina métodos de pago, políticas y FAQs.

**UX propuesta:** Accordion o tabs con 3 secciones colapsables:

```
┌─────────────────────────────────────────────────────────────┐
│  Personaliza tu tienda                                      │
├─────────────────────────────────────────────────────────────┤
│  ▼ Métodos de pago                              [Completado]│
│    ☑ Efectivo / Contraentrega                               │
│    ☑ Transferencia/Nequi  → [Banco] [Cuenta] [Titular]      │
│    ☐ Link de pago         → [URL: https://...]              │
├─────────────────────────────────────────────────────────────┤
│  ▶ Políticas de tu negocio                      [Pendiente] │
│    (colapsado hasta expandir)                               │
├─────────────────────────────────────────────────────────────┤
│  ▶ Preguntas frecuentes                         [5 de 10]   │
│    (colapsado hasta expandir)                               │
└─────────────────────────────────────────────────────────────┘
```

**Sección 1: Métodos de Pago**

| Campo | Tipo | Validación | Notas |
|-------|------|------------|-------|
| `acceptsCash` | checkbox | — | Contraentrega / efectivo |
| `acceptsTransfer` | checkbox | — | Si ✓ → mostrar campos bancarios |
| `bankName` | input | max 100, opcional | Ej: "Bancolombia", "Nequi" |
| `bankAccount` | input | max 50, opcional | Número de cuenta |
| `bankHolder` | input | max 100, opcional | Titular |
| `acceptsPaymentLink` | checkbox | — | Si ✓ → mostrar campo URL |
| `paymentLinkUrl` | input | URL válida, opcional | Wompi, PayU, MercadoPago |

**Sección 2: Políticas**

| Campo | Tipo | Validación | Default "Retail General" |
|-------|------|------------|--------------------------|
| `shippingPolicy` | textarea | max 500 chars, required | "Envíos a toda Colombia. Tiempo: 3-5 días hábiles. Costo según ciudad." |
| `returnPolicy` | textarea | max 500 chars, required | "Aceptamos cambios dentro de 8 días. Producto sin uso y con etiquetas." |
| `businessHours` | input | max 200 chars, opcional | "Lunes a Viernes 9am-6pm, Sábados 9am-1pm" |

**Sección 3: Preguntas Frecuentes**

| Campo | Tipo | Validación |
|-------|------|------------|
| `faqs` | array | max 10 items |
| `faqs[].question` | input | max 100 chars |
| `faqs[].answer` | textarea | max 300 chars |
| `faqs[].keywords` | chips (auto) | generados desde question |

**FAQs prellenadas "Retail General" (5 de 10):**

```json
[
  {
    "question": "¿Cuánto demora el envío?",
    "keywords": ["envio", "demora", "llega", "tiempo", "dias"],
    "answer": "Los envíos demoran 3-5 días hábiles después de confirmar tu pago 📦"
  },
  {
    "question": "¿Hacen envíos a mi ciudad?",
    "keywords": ["envio", "ciudad", "departamento", "llegan", "envian"],
    "answer": "¡Sí! Hacemos envíos a toda Colombia 🇨🇴"
  },
  {
    "question": "¿Puedo cambiar o devolver?",
    "keywords": ["cambio", "devolucion", "devolver", "cambiar", "garantia"],
    "answer": "Tienes 8 días para cambios. El producto debe estar sin uso y con etiquetas 🏷️"
  },
  {
    "question": "¿Qué métodos de pago aceptan?",
    "keywords": ["pago", "pagar", "nequi", "transferencia", "efectivo", "tarjeta"],
    "answer": "Aceptamos efectivo contra entrega, transferencia/Nequi y links de pago 💳"
  },
  {
    "question": "¿Tienen garantía?",
    "keywords": ["garantia", "defecto", "dañado", "roto"],
    "answer": "Todos nuestros productos tienen garantía de 30 días por defectos de fábrica ✅"
  }
]
```

**Backend — campos existentes:**
- `MerchantConfig.paymentMethods` (JSON) ✅
- `MerchantConfig.shippingConfig` (JSON) → agregar `shippingPolicy` string
- `MerchantConfig.returnPolicy` (string) ✅
- `PlaybookConfig.faqs` (array) ✅
- **Falta:** `businessHours` en MerchantConfig (migration simple)
- **Falta:** `paymentLinkUrl` en paymentMethods schema

---

## 3. Decisión de Estrategia

### 3.1 Opción Elegida: **A (Feature Flags + Kill-switch)**

**Razón:** El código B2 es mínimo y bien encapsulado. No justifica la complejidad de cherry-pick (Opción B).

### 3.2 Detalle de Implementación

#### 3.2.1 Kill-switch Global: `FEATURES_MODE`

```typescript
// env.validation.ts
FEATURES_MODE: Joi.string()
  .valid('mvp', 'dev', 'full')
  .default('mvp'),
```

**Valores:**
- `mvp` (default): Solo features MVP habilitadas. **Usar en `main` deployment.**
- `dev`: MVP + features B2 para testing interno (opcional).
- `full`: Todo habilitado (futuro, post-B2 lanzamiento).

#### 3.2.2 Feature Flags Granulares

| Flag | Default MVP | Descripción |
|------|-------------|-------------|
| `MULTI_CHANNEL_ENABLED` | `false` | Permitir >1 canal por merchant |
| `INSTAGRAM_ENABLED` | `false` | Habilitar onboarding Instagram |
| `INDUSTRIES_ENABLED` | `false` | Selector de verticales (ropa/belleza/minimarket). MVP usa "Retail General" |
| `PLAYBOOK_EDITOR_ENABLED` | `false` | Editor avanzado de playbook (B2) |
| `TEMPLATE_PACK_ENABLED` | `false` | TemplatePack en DB (Bloque 7) |

**Notas:**
- En `FEATURES_MODE=mvp`, todos los flags B2 son `false` **forzadamente** (kill-switch duro)
- En `FEATURES_MODE=dev`, flags se respetan según env vars individuales
- Ya existen flags LLM granulares (`LLM_INTENT_ASSIST`, `LLM_FALLBACK_ENABLED`, `LLM_SUMMARY_ENABLED`)

#### 3.2.3 Gating Server-Side

```typescript
// feature-flags.service.ts (nuevo)
@Injectable()
export class FeatureFlagsService {
  private readonly mode: 'mvp' | 'dev' | 'full';

  constructor(private config: ConfigService) {
    this.mode = this.config.get('FEATURES_MODE', 'mvp') as 'mvp' | 'dev' | 'full';
  }

  get isMultiChannelEnabled(): boolean {
    if (this.mode === 'mvp') return false; // Kill-switch
    return this.config.get<boolean>('MULTI_CHANNEL_ENABLED', false);
  }

  get isInstagramEnabled(): boolean {
    if (this.mode === 'mvp') return false;
    return this.config.get<boolean>('INSTAGRAM_ENABLED', false);
  }

  // ... más flags
}
```

**Gating en endpoints:**
```typescript
// Example: Block second channel creation in MVP
@Post('channels')
async createChannel(@Body() dto: CreateChannelDto, @Session() session: SessionData) {
  if (!this.featureFlags.isMultiChannelEnabled) {
    const existing = await this.channelRepo.findByMerchantId(session.merchantId);
    if (existing.length >= 1) {
      throw new ForbiddenException('Multi-channel requires enterprise plan');
    }
  }
  // ...
}
```

#### 3.2.4 Gating Frontend

**Variables de entorno públicas:**
```bash
# .env.local (dashboard)
NEXT_PUBLIC_FEATURES_MODE=mvp
NEXT_PUBLIC_MULTI_CHANNEL_ENABLED=false
```

**Hook de features:**
```typescript
// hooks/use-features.ts
export function useFeatures() {
  const mode = process.env.NEXT_PUBLIC_FEATURES_MODE ?? 'mvp';
  
  return {
    isMultiChannelEnabled: mode !== 'mvp' && 
      process.env.NEXT_PUBLIC_MULTI_CHANNEL_ENABLED === 'true',
    isInstagramEnabled: mode !== 'mvp' && 
      process.env.NEXT_PUBLIC_INSTAGRAM_ENABLED === 'true',
    isIndustriesEnabled: mode !== 'mvp' && 
      process.env.NEXT_PUBLIC_INDUSTRIES_ENABLED === 'true',
    // MVP: retail general único, sin selector de industria
  };
}
```

**Uso en componentes:**
```tsx
// step-customize.tsx - MVP: usa preset "retail" automáticamente
// Si isIndustriesEnabled (B2), mostrar selector ropa/belleza/minimarket
// Si !isIndustriesEnabled (MVP), aplicar preset "retail" por defecto al montar
```

---

## 4. Flujo Operativo con `dev` + `main` + WorkTree

### 4.1 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUJO DE TRABAJO                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐ │
│  │     dev     │────▶│    main     │────▶│   release/v1.x      │ │
│  │ (desarrollo)│     │   (QA MVP)  │     │   (producción)      │ │
│  └─────────────┘     └─────────────┘     └─────────────────────┘ │
│        │                   │                      │              │
│        │                   │                      │              │
│  FEATURES_MODE=dev   FEATURES_MODE=mvp    FEATURES_MODE=mvp      │
│  (B2 opcional)       (kill-switch duro)   (kill-switch duro)     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Reglas por Rama

| Rama | Propósito | `FEATURES_MODE` | Quién trabaja |
|------|-----------|-----------------|---------------|
| `dev` | Desarrollo activo | `dev` o `mvp` | Agentes (PRs) |
| `main` | QA manual / staging | `mvp` (obligatorio) | Merge desde `dev` |
| `release/v1.x` | Producción | `mvp` | Tag desde `main` |

### 4.3 Reglas Operativas para Agentes

#### 4.3.1 Dónde se abren PRs
- **SIEMPRE en `dev`** (rama target: `dev`)
- Nunca directamente a `main`

#### 4.3.2 Cómo se validan
1. Builder implementa en feature branch
2. PR apunta a `dev`
3. CI corre tests con `FEATURES_MODE=mvp` (validar que MVP funciona)
4. CI corre tests con `FEATURES_MODE=dev` (validar que B2 no rompe)
5. Reviewer valida contra brief

#### 4.3.3 Cómo se promueve a `main`
1. **Merge regular** de `dev` → `main` (no cherry-pick)
2. Antes del merge, asegurar que `dev` está estable
3. `main` siempre deployea con `FEATURES_MODE=mvp`
4. QA manual en `main` valida solo flujo MVP

#### 4.3.4 Cómo manejar código B2
- Código B2 puede existir en `dev` y `main`
- Código B2 **DEBE** estar detrás de feature flags
- En `main` con `FEATURES_MODE=mvp`, B2 está **apagado** automáticamente
- No hay necesidad de excluir código B2 de merges

### 4.4 Configuración por Entorno

**.env.development (dev WorkTree):**
```bash
FEATURES_MODE=dev
MULTI_CHANNEL_ENABLED=false  # Optional: true para probar B2
INSTAGRAM_ENABLED=false
```

**.env.staging (main deployment):**
```bash
FEATURES_MODE=mvp  # OBLIGATORIO
# Los flags individuales son ignorados en modo mvp
```

**.env.production:**
```bash
FEATURES_MODE=mvp
# Los flags individuales son ignorados en modo mvp
```

---

## 5. PR-STACK Actualizado (MVP Cleanup)

### 5.1 Nuevo PR: PR-MVP-01 — Feature Flags Infrastructure

**Prioridad:** P0 BLOCKER  
**Dependencias:** Ninguna  
**Incluye:**
- `FeatureFlagsService` con kill-switch `FEATURES_MODE`
- Flags: `MULTI_CHANNEL_ENABLED`, `INSTAGRAM_ENABLED`, `PLAYBOOK_EDITOR_ENABLED`
- Gating en `ChannelController` (1 canal max en MVP)
- Frontend hook `useFeatures()`
- Actualización de `env.validation.ts`
- Documentación en `BACKEND-EXECUTION-GUIDE.md`
- Tests

**DoD:**
- `FEATURES_MODE=mvp` bloquea creación de segundo canal
- Frontend no muestra opciones B2 en modo MVP
- `pnpm lint`, `pnpm test` pasan

### 5.2 Orden de Ejecución Actualizado

```
┌─────────────────────────────────────────────────────────────────┐
│             MVP CLEANUP — ORDEN DE EJECUCIÓN                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ✅ COMPLETADO: Backend Core                                     │
│  ├── Bloque 1: Pedidos (PR-04 a PR-06) ✅                        │
│  ├── Bloque 2: Operación (PR-07, PR-08) ✅                       │
│  ├── Bloque 3: APIs (PR-15, PR-16, PR-17) ✅                     │
│  └── Bloque 4: Onboarding (PR-OB-01, PR-FE-OB) ✅                │
│                                                                   │
│  FASE 0: Separación MVP/B2 (1-2 días)                            │
│  ├── PR-MVP-01: Feature Flags Infrastructure ⬅ PRIMERO           │
│  ├── PR-FE-OB-2: Wizard step-customize (pagos+políticas+FAQs)    │
│  └── Sincronizar main con dev (merge limpio)                     │
│                                                                   │
│  FASE 1: Dashboard UIs (paralelizable, 3-4 días)                 │
│  ├── PR-FE-03: Channels UI                                       │
│  ├── PR-FE-04: Catalog UI                                        │
│  ├── PR-FE-05: Settings UI                                       │
│  └── PR-FE-06: Orders UI ("Torre de Control")                    │
│                                                                   │
│  FASE 2: Hardening + Activación (1 día)                          │
│  └── PR-MVP-02: MVP Polish + Test Script + Docs                  │
│                                                                   │
│  ═══════════════════════════════════════════════════════════════ │
│  POST-MVP (B2, defer)                                            │
│  ├── PR-09: Carrito abandonado                                   │
│  ├── PR-10: Analytics                                            │
│  ├── Bloque 7: Template Formalization (PR-20 a PR-25)            │
│  └── Multi-channel + Instagram                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 PRs Completados (resumen de lo implementado)

#### Backend Core ✅
- **PR-08 — Handoff:** Detección keyword + resumen + integración relay ✅
- **PR-GAP-2 — FAQ:** PlaybookConfig.faqs + FaqFlow + presets ✅
- **PR-15 — Settings API:** CRUD playbook + merchant profile ✅
- **PR-16 — Channel List API:** GET /channels para merchant ✅
- **PR-17 — Catalog Import:** multipart/form-data upload ✅

#### Frontend Core ✅
- **PR-FE-01 — Bootstrap:** Next.js + shadcn + TanStack Query ✅
- **PR-FE-OB — Wizard UI:** 5 pasos iniciales (se reduce a 4 en PR-FE-OB-2) ✅
- **PR-OB-01 — Wizard API:** progress tracker + presets + activación ✅

#### Frontend Pendiente (Wizard)
- **PR-FE-OB-2 — step-customize:** Reducción a 4 pasos + Pagos + Políticas + FAQs

### 5.4 PRs Pendientes (Dashboard UIs)

---

## 6. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Feature flag mal implementado expone B2 en MVP | Media | Alto | CI tests con `FEATURES_MODE=mvp`, code review obligatorio |
| Merge de `dev` → `main` trae bugs | Media | Medio | QA manual en main antes de release, rollback rápido |
| Confusión de agentes sobre dónde trabajar | Baja | Bajo | Documentación clara, PRs siempre a `dev` |
| Código B2 sin flag se escapa | Media | Alto | Regla: todo código B2 nuevo DEBE tener flag + test |

---

## 7. Checklist de Validación

### 7.1 Pre-Merge PR-MVP-01
- [ ] `FeatureFlagsService` creado con kill-switch
- [ ] `env.validation.ts` actualizado con `FEATURES_MODE`
- [ ] Gating server-side en creación de segundo canal
- [ ] Frontend hook `useFeatures()` creado
- [ ] Tests con `FEATURES_MODE=mvp` pasan
- [ ] Tests con `FEATURES_MODE=dev` pasan
- [ ] Documentación actualizada

### 7.2 Pre-Merge a `main` (QA MVP)
- [ ] `main` configura `FEATURES_MODE=mvp`
- [ ] Wizard completo funciona (4 pasos: channel, catalog, customize, activate)
- [ ] step-customize guarda pagos + políticas + FAQs correctamente
- [ ] FAQs prellenadas de "Retail General" aparecen al entrar
- [ ] Comandos WhatsApp merchant funcionan (confirmar, pagado, etc.)
- [ ] Handoff funcional (keyword detection)
- [ ] Solo 1 canal WhatsApp permitido
- [ ] No hay UI de features B2 visible

---

## 8. Handoff a Planner

### 8.1 PR-MVP-01 — Feature Flags Infrastructure

**Prompt para Planner:**

> Genera brief.md para PR-MVP-01 "Feature Flags Infrastructure" con los siguientes REQs:
>
> **REQ-01:** Crear `FeatureFlagsService` en `apps/api/src/common/feature-flags/`
> - Inyectar `ConfigService`
> - Leer `FEATURES_MODE` (mvp | dev | full)
> - Implementar getters: `isMultiChannelEnabled`, `isInstagramEnabled`, `isPlaybookEditorEnabled`
> - En modo `mvp`, todos los flags B2 retornan `false` (kill-switch)
>
> **REQ-02:** Actualizar `env.validation.ts` con nuevos flags
> - `FEATURES_MODE`: Joi.string().valid('mvp', 'dev', 'full').default('mvp')
> - `MULTI_CHANNEL_ENABLED`: Joi.boolean().default(false)
> - `INSTAGRAM_ENABLED`: Joi.boolean().default(false)
> - `PLAYBOOK_EDITOR_ENABLED`: Joi.boolean().default(false)
>
> **REQ-03:** Gating en `OnboardingController` y `ChannelController`
> - Si `!isMultiChannelEnabled` y merchant ya tiene 1 canal → 403 "Multi-channel requires enterprise plan"
>
> **REQ-04:** Frontend hook `useFeatures()` en `apps/dashboard/src/hooks/use-features.ts`
> - Leer `NEXT_PUBLIC_FEATURES_MODE` y flags públicos
> - Export objeto con booleans por feature
>
> **REQ-05:** Actualizar `.env.example` (API y Dashboard)
>
> **REQ-06:** Tests unitarios para `FeatureFlagsService`
> - Test: modo mvp → todos flags false
> - Test: modo dev → respeta flags individuales
>
> **DoD:** 
> - `FEATURES_MODE=mvp` bloquea segundo canal
> - Dashboard no muestra opciones B2 en MVP
> - `pnpm lint`, `pnpm test`, `npx tsc --noEmit` pasan

### 8.2 PR-FE-OB-2 — Wizard: step-customize

**Prompt para Planner:**

> Genera brief.md para PR-FE-OB-2 "Wizard: step-customize" en docs/plan/pr-briefs/PR-FE-OB-2-wizard-customize.md
>
> **Depende de:** PR-FE-OB ✅, PR-OB-01 ✅, PR-GAP-2 ✅ (FAQs backend)
>
> **Contexto:** El wizard actual tiene 5 pasos. Este PR lo reduce a 4 pasos eliminando step-profile (redundante, datos vienen del login OIDC) y REEMPLAZA step-payments con step-customize que combina: pagos + políticas + FAQs en un solo paso de personalización.
>
> **REQ-01:** Crear step-customize.tsx con UX de accordion/tabs (3 secciones)
> - Sección 1: "Métodos de pago" (expandida por default)
> - Sección 2: "Políticas de tu negocio" (colapsada)
> - Sección 3: "Preguntas frecuentes" (colapsada, badge "X de 10")
> - Cada sección colapsable con indicador de completado
>
> **REQ-02:** Sección "Métodos de pago"
> - Checkboxes: contraentrega, transferencia/Nequi, link de pago
> - Si transferencia ✓ → campos: banco, cuenta, titular (opcionales)
> - Si link de pago ✓ → campo URL (validar URL válida)
> - Al menos 1 método requerido
>
> **REQ-03:** Sección "Políticas de tu negocio"
> - `shippingPolicy` (textarea, max 500 chars, required)
> - `returnPolicy` (textarea, max 500 chars, required)
> - `businessHours` (input, max 200 chars, optional)
> - Defaults "Retail General" prellenados al montar
>
> **REQ-04:** Sección "Preguntas frecuentes"
> - Lista editable de FAQs (max 10)
> - Cada FAQ: input question (max 100) + textarea answer (max 300)
> - Keywords auto-generados desde question (normalizar: lowercase, sin tildes)
> - Botón "+ Agregar" (disabled si ≥10), botón "🗑️" por FAQ
> - 5 FAQs de "Retail General" prellenadas
>
> **REQ-05:** Actualizar wizard page.tsx
> - Reemplazar `<StepPayments />` con `<StepCustomize />`
> - Mantener step 4 como "customize" (NO agregar paso extra)
> - Actualizar `ONBOARDING_STEPS` label: "Personalización"
> - step-payments.tsx puede eliminarse o deprecarse
>
> **REQ-06:** Backend (migration)
> - Agregar `businessHours` a `MerchantConfig` schema
> - Agregar `paymentLinkUrl` al JSON de `paymentMethods`
> - Actualizar DTOs correspondientes
>
> **REQ-07:** API calls desde step-customize
> - Pagos: `PATCH /merchants/me/config` (paymentMethods, businessHours)
> - Políticas: `PATCH /merchants/me/config` (shippingPolicy, returnPolicy)
> - FAQs: `PATCH /merchants/me/playbook` (faqs array)
> - Guardar al salir del paso (onNext) o con botón "Guardar" por sección
>
> **DoD:**
> - Wizard tiene 4 pasos funcionales (channel, catalog, customize, activate)
> - step-profile y step-payments eliminados/deprecados
> - step-customize tiene 3 secciones colapsables
> - Métodos de pago con URL de link guardados
> - Políticas y businessHours guardadas
> - FAQs editables y prellenadas
> - Bot responde correctamente a FAQs editadas
> - Responsive (mobile-first)
> - `pnpm build`, `pnpm lint`, `npx tsc --noEmit` pasan

### 8.3 PR-FE-03 — Channels UI

**Prompt para Planner:**

> Genera brief.md para PR-FE-03 "Dashboard: Channels UI" en docs/plan/pr-briefs/PR-FE-03-channels-ui.md
>
> **Depende de:** PR-FE-01 ✅, PR-16 ✅, PR-14 ✅, PR-MVP-01
>
> **REQ-01:** Página `/dashboard/channels` con lista de canales conectados
> - Consumir `GET /channels` (PR-16)
> - Mostrar status badges (connected, pending, error)
> - Card por canal con: displayName, type, status, lastWebhookAt
>
> **REQ-02:** Panel de health por canal
> - Consumir `GET /channels/:id/health` (PR-14)
> - Mostrar: status, webhookSubscribed, recentErrors, recommendation
> - Botón "Retry Webhook" → `POST /channels/:id/retry-webhook`
>
> **REQ-03:** Botón "Conectar WhatsApp" (si no hay canales)
> - Redirect a Meta Embedded Signup (flow existente)
> - En modo MVP, ocultar botón si ya hay 1 canal (usar `useFeatures()`)
>
> **DoD:**
> - Lista de canales funcional con health panel
> - Retry webhook actualiza estado
> - Multi-channel gated en MVP
> - `pnpm build`, `pnpm lint` pasan

### 8.4 PR-FE-04 — Catalog UI

**Prompt para Planner:**

> Genera brief.md para PR-FE-04 "Dashboard: Catalog UI" en docs/plan/pr-briefs/PR-FE-04-catalog-ui.md
>
> **Depende de:** PR-FE-01 ✅, PR-17 ✅, PR-03.7 ✅
>
> **REQ-01:** Página `/dashboard/catalog` con tabla de productos
> - Consumir `GET /api/catalog/products` (PR-03.7)
> - Columns: imagen, nombre, SKU, precio, stock, categoría
> - Sorting + filtering básico
>
> **REQ-02:** Drag & drop CSV upload
> - Componente dropzone para subir archivo
> - Consumir `POST /api/catalog/import-file` (PR-17, multipart)
> - Mostrar stats post-import (created, updated, errors)
>
> **REQ-03:** Edición inline de stock/precio
> - Click en celda → editar → `PATCH /api/catalog/products/:id`
> - Optimistic update con rollback
>
> **DoD:**
> - Upload CSV funciona con drag & drop
> - Tabla muestra productos con sorting
> - Edición inline de stock/precio
> - `pnpm build`, `pnpm lint` pasan

### 8.5 PR-FE-05 — Settings UI

**Prompt para Planner:**

> Genera brief.md para PR-FE-05 "Dashboard: Playbook Settings UI" en docs/plan/pr-briefs/PR-FE-05-settings-ui.md
>
> **Depende de:** PR-FE-01 ✅, PR-15 ✅, PR-FE-OB-2
>
> **REQ-01:** Página `/dashboard/settings` con secciones
> - Profile: nombre de negocio (read-only desde OIDC)
> - **NOTA MVP:** Sin selector de industria (usa "Retail General" fijo)
>
> **REQ-02:** Sección de mensajes del bot (PlaybookConfig.messages)
> - Form con campos: greeting, help, cartEmpty, etc.
> - Consumir `PATCH /merchants/me/playbook`
>
> **REQ-03:** Sección de pagos (MerchantConfig)
> - Métodos de pago habilitados (COD, transfer, payment_link)
> - Campo URL para link de pago (si payment_link habilitado)
> - Instrucciones de pago por método
> - Consumir `PATCH /merchants/me/config`
>
> **REQ-04:** Sección de políticas (edición post-wizard)
> - Lo configurado en step-customize editable desde aquí
> - shippingPolicy, returnPolicy, businessHours
> - Consumir `PATCH /merchants/me/config`
>
> **REQ-05:** Sección de FAQs (edición post-wizard)
> - Lista editable de FAQs (max 10)
> - Misma UI que step-customize pero para edición posterior
> - Consumir `PATCH /merchants/me/playbook`
>
> **DoD:**
> - Settings editables y persistentes
> - Validación de formularios
> - Sin selector de industria en MVP (gated por `INDUSTRIES_ENABLED`)
> - `pnpm build`, `pnpm lint` pasan

### 8.6 PR-FE-06 — Orders UI

**Prompt para Planner:**

> Genera brief.md para PR-FE-06 "Dashboard: Orders UI" en docs/plan/pr-briefs/PR-FE-06-orders-ui.md
>
> **Depende de:** PR-FE-01 ✅, PR-05 ✅
>
> **REQ-01:** Página `/dashboard/orders` con lista de pedidos
> - Consumir `GET /orders` (verificar si endpoint existe; si no, implementar)
> - Columns: orderCode, status, customer, total, createdAt
> - Status badges con colores por estado
>
> **REQ-02:** Filtros por status y fecha
> - Dropdown de status: pending_payment, confirmed, paid, shipped, delivered
> - Date range picker
>
> **REQ-03:** Detalle de pedido (drawer o modal)
> - Items del pedido con qty y precio
> - Datos de cliente y dirección
> - Método de pago
>
> **REQ-04:** Acciones de cambio de estado
> - Botones: Confirmar, Marcar Pagado, Marcar Enviado, Cancelar
> - Consumir `PATCH /orders/:id/status` (verificar si endpoint existe)
> - Optimistic update
>
> **REQ-05:** Contador de pendientes en sidebar/header
> - Badge con count de orders donde status = pending_payment o confirmed
>
> **DoD:**
> - Lista de pedidos con filtros funcionales
> - Acciones de cambio de estado funcionan
> - Contador de pendientes visible
> - Responsive (mobile-first)
> - `pnpm build`, `pnpm lint` pasan

---

## 9. Confirmaciones Explícitas

### ✅ Comandos/Pedidos por WhatsApp quedan dentro del MVP
- PR-05.1 (Merchant Commands) ya está mergeado ✅
- Comandos: `confirmar`, `rechazar`, `pagado`, `enviado`, `pedido`, `pendientes`, `hoy`, `ayuda`
- Integrado con PR-05.2 (Message Relay) ✅

### ✅ Handoff queda dentro del MVP
- PR-08 (Handoff) ya está mergeado ✅
- Detección por keyword ("hablar con persona", "asesor")
- Resumen determinístico (sin LLM obligatorio)
- Integración con relay bidireccional (PR-05.2)

### ✅ FAQ básico queda dentro del MVP
- PR-GAP-2 ya está mergeado ✅
- PlaybookConfig.faqs con keyword matching
- MVP usa preset "Retail General" con FAQs genéricos

### ⏸️ Verticales/Industries → B2
- `ropa`, `belleza`, `minimarket` quedan como B2 (flag `INDUSTRIES_ENABLED`)
- MVP usa **"Retail General" único** — sin selector de industria en wizard
- PlaybookConfig básico editable via API (PR-15) ✅, pero industria fija en MVP
- Decisión: validar mercado rápido con preset genérico, luego verticales específicos

---

## 10. Próximos Pasos

> **🎉 El core backend está COMPLETO.** Solo faltan las UIs del dashboard.

1. **Planner** genera brief para `PR-MVP-01` (Feature Flags)
2. **Builder** implementa feature flags infrastructure
3. **Merge** `PR-MVP-01` a `dev`
4. **Planner** genera brief para `PR-FE-OB-2` (Wizard step-customize)
5. **Builder** implementa step-customize
6. **Merge** `PR-FE-OB-2` a `dev`
7. **Sincronizar** `main` con `dev` (merge limpio)
8. **Ejecutar en paralelo** PRs de Dashboard UIs:
   - PR-FE-03 (Channels UI)
   - PR-FE-04 (Catalog UI)
   - PR-FE-05 (Settings UI)
   - PR-FE-06 (Orders UI)
9. **QA** en `main` con `FEATURES_MODE=mvp`
10. **Release MVP** — wizard 4 pasos + comandos + handoff + dashboard básico

---

## Apéndice A: Feature Flags Reference

```bash
# =========================================
# FEATURES_MODE — Kill-switch global
# =========================================
# mvp  → Todo B2 deshabilitado (default, usar en main/prod)
# dev  → Respeta flags individuales (desarrollo)
# full → Todo habilitado (futuro post-B2)
FEATURES_MODE=mvp

# =========================================
# Flags B2 (ignorados si FEATURES_MODE=mvp)
# =========================================
MULTI_CHANNEL_ENABLED=false
INSTAGRAM_ENABLED=false
PLAYBOOK_EDITOR_ENABLED=false
TEMPLATE_PACK_ENABLED=false

# =========================================
# Flags LLM (existentes, respetados siempre)
# =========================================
LLM_ENABLED=false
LLM_INTENT_ASSIST=false
LLM_FALLBACK_ENABLED=false
LLM_SUMMARY_ENABLED=false
```

---

## Apéndice B: Archivos a Modificar (PR-MVP-01)

```
apps/api/
├── src/
│   ├── common/
│   │   ├── config/
│   │   │   └── env.validation.ts          # Agregar FEATURES_MODE + flags
│   │   └── feature-flags/                  # NUEVO directorio
│   │       ├── feature-flags.module.ts
│   │       ├── feature-flags.service.ts
│   │       └── feature-flags.service.spec.ts
│   ├── onboarding/
│   │   └── onboarding.controller.ts        # Gating multi-channel
│   └── channels/
│       └── channels.controller.ts          # Gating multi-channel (si existe)
└── .env.example                            # Actualizar

apps/dashboard/
├── src/
│   └── hooks/
│       └── use-features.ts                 # NUEVO hook
└── .env.example                            # Actualizar con NEXT_PUBLIC_*
```
