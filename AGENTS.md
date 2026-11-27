# AGENTS.md

> Guardrails globales para todos los agentes Copilot.
> Metodologia: **Spec-Driven Development (SDD)** — el brief.md es la fuente de verdad.
>
> Detalle completo del flujo: `docs/plan/SDD-FLOW.md`
> Roles: `.github/agents/*.agent.md`
> Spec de producto: `docs/mvp-core-v1.md`

## 1. Principio SDD

**La spec (brief.md) es la fuente de verdad. Todo se verifica contra ella.**

- No se codea sin brief APPROVED (BRIEF GATE).
- No se mergea sin evidencia completa por AC (VERIFICATION GATE).
- Si falta info, se abre Spec Change Request y se PARA.

## 2. Product scope (MVP V1)

- **WhatsApp-first** conversational commerce para PYMEs.
- V1: catalog -> cart -> checkout -> payment -> order status -> handoff.
- **Out of scope:** CRM pipelines, advanced marketing, enterprise integrations.

## 3. Non-negotiable rules

### 3.0 API Consumer-First (CRITICAL)

**La API debe ser usable desde afuera sin conocimiento interno del código.**

Principios:
- **UI-ready**: endpoints diseñados para consumo desde frontend (drag & drop, forms, redirects)
- **cURL-testable**: cada endpoint testeable con cURL copy-paste (sin transformaciones)
- **Auth consistente**: Session Cookie (dashboard), API Key (catalog), Webhook Signature (Meta)
- **DTOs externos**: estructura pensada para el consumidor, no para la implementación interna
- **Documentación primero**: `BACKEND-EXECUTION-GUIDE.md` actualizado ANTES de mergear

**Checklist obligatorio para endpoints:**
- [ ] ¿UI puede consumirlo directamente? (ej: file upload con multipart, no JSON con contenido)
- [ ] ¿cURL example funciona copy-paste?
- [ ] ¿Auth method es consistente con endpoints similares?
- [ ] ¿Errores son accionables para el consumidor?
- [ ] ¿Documentación actualizada en BACKEND-EXECUTION-GUIDE.md?

### 3.1 Transactional correctness

- Todo estado de negocio **persistido en PostgreSQL**.
- Webhooks **idempotentes**:
  - inbound: dedupe por `message_id` (unique)
  - payments: por `payment_intent_id` (unique)

### 3.2 LLM guardrails

- LLM para: intent, lenguaje natural, clarificaciones, resumenes.
- LLM **NO inventa**: stock, precios, politicas, tiempos de entrega.
- Confirmaciones transaccionales desde backend services/tools.

### 3.3 Safety and privacy

- Minimizar PII almacenado y loggeado.
- Secrets nunca commiteados; actualizar `.env.example` para nueva config.

### 3.4 Engineering hygiene

- Diffs pequenos, incrementales.
- Tests para paths criticos (idempotencia, transiciones de estado).

### 3.5 TypeScript & Build correctness (ANTI-PATRONES CONOCIDOS)

> Errores reales que ocurrieron en este repo. El Builder los verifica ANTES de pasar al Reviewer.

#### TypeScript — errores de compilación

| Anti-patrón | Fix obligatorio |
|---|---|
| Propiedad de clase NestJS sin inicializador (TS2564) | Agregar `!` a TODAS las props de DTOs, Entities y Response classes con decoradores NestJS |
| `error` en catch block con tipo `unknown` (TS18046) | Usar `(error as Error).message` o `instanceof Error` guard. Nunca `error.message` directo |
| Objeto/Record asignado a `JsonValue` de Prisma (TS2322) | Siempre usar patrón `as unknown as Prisma.InputJsonValue` (doble cast obligatorio) |
| `import * as pkg` con esModuleInterop activo (TS2349) | Usar `import pkg from 'pkg'` para módulos con export default (ej: cookie-parser) |
| Path relativo incorrecto en `import` (TS2307) | Verificar profundidad `../` al crear archivos en subdirectorios nuevos |
| Paquete npm sin tipos (TS7016) | Instalar `@types/pkg` o crear `src/types/pkg.d.ts` con `declare module 'pkg' { ... }` |
| Enum vs string literal (TS2345) | Usar el enum importado (`Channel.WHATSAPP`) en vez de string crudo (`'whatsapp'`) |
| `Prisma.X` sin importar namespace `Prisma` (TS2503) | Agregar `Prisma` al import de `@prisma/client` explícitamente |

#### Runtime — errores en ejecución

| Anti-patrón | Fix obligatorio |
|---|---|
| `configService.get<number>('VAR')` devuelve `string` | Wrappear con `Number()` explícito; **Y** declarar la var como `Joi.number()` en `env.validation.ts` |
| Variable de entorno nueva usada pero no declarada en Joi | SIEMPRE agregar cada nueva var a `env.validation.ts` **antes** de usarla |
| Parámetros `LIMIT`/`attempts <` en `$queryRaw` como string | Los valores numéricos de ConfigService deben pasarse como `Number(value)` al raw SQL |
| `Joi.string().optional()` con valor `""` falla validación | Usar `.allow('')` o `Joi.string().optional().allow('')` para strings opcionales que pueden ser vacíos |

#### Build — errores de compilación/arranque

| Anti-patrón | Fix obligatorio |
|---|---|
| `deleteOutDir: true` + `incremental: true` = sin `dist/` en `start:dev` | Usar `deleteOutDir: false` en `nest-cli.json` cuando `incremental` está activo |
| `.tsbuildinfo` stale bloquea emisión | Borrar `tsconfig.build.tsbuildinfo` antes del build inicial o tras cambios de config |
| Nueva variable en `.env.example` pero no en `env.validation.ts` | Ambos archivos deben actualizarse juntos en el mismo commit |

#### Regla de oro del Builder

Antes de hacer handoff al Reviewer, ejecutar:
```bash
npx tsc --noEmit  # 0 errores obligatorio
pnpm lint         # 0 errores obligatorio  
pnpm test         # todos los tests passing
```

### 3.6 Feature Flags para código B2

> Desde PR-MVP-01, todo código B2 debe estar gated. Referencia: `docs/architecture/mvp-separation.md`

**Clasificación obligatoria:**

| MVP (habilitado siempre) | B2 (requiere feature flag) |
|--------------------------|---------------------------|
| WhatsApp único | Multi-channel |
| Retail General preset | Verticales (ropa/belleza/minimarket) |
| Wizard 4 pasos | Editor playbooks avanzado |
| Comandos merchant WhatsApp | Instagram channel |
| FAQs editables simples | TemplatePack en DB |

**Reglas duras:**
1. Todo código B2 nuevo **DEBE** tener feature flag (`FeatureFlagsService.isXEnabled`)
2. Frontend B2 **DEBE** usar `useFeatures()` hook para gating
3. Tests **DEBEN** pasar con `FEATURES_MODE=mvp` (kill-switch activo)
4. Brief **DEBE** indicar si el PR es MVP o B2

**Responsabilidades por rol:**

| Rol | Responsabilidad Feature Flags |
|-----|------------------------------|
| **Architect** | Clasificar feature como MVP/B2 en PR-STACK entry |
| **Planner** | Incluir campo `Scope: MVP` o `Scope: B2` en brief.md |
| **Builder** | Implementar flag + test con `FEATURES_MODE=mvp` |
| **Reviewer** | Verificar flag existe y test pasa en modo MVP |

**Anti-patrón crítico:**

| Anti-patrón | Fix obligatorio |
|-------------|-----------------|
| Código B2 sin feature flag | Agregar `if (!this.featureFlags.isXEnabled)` guard + 403 |
| UI B2 visible en modo MVP | Envolver con `{features.isXEnabled && <Component />}` |
| Test solo con `FEATURES_MODE=dev` | Agregar test con `FEATURES_MODE=mvp` que valide gating |

## 4. Roles (SDD)

| Rol | Responsabilidad | NO puede |
|-----|----------------|----------|
| **Architect** | Tech design + PR-STACK entries | Codear, crear issues, aprobar PRs |
| **Planner** | Brief (DRAFT), issues (post-gate), branch, SCR updates | Codear, crear branch pre-BRIEF GATE |
| **Builder** | Implementar spec-locked, evidencia por AC, SCR si gap | Agregar scope, modificar spec, mergear |
| **Reviewer** | Validar contra brief AC/DoD, emitir verdict | Implementar fixes, editar archivos |

## 5. Gates

| Gate | Condicion | Quien aprueba |
|------|-----------|---------------|
| **BRIEF GATE** | brief.md completo con REQs + ACs | Humano |
| **VERIFICATION GATE** | Todos AC con evidencia + DoD completo | Humano |

## 6. How to work in this repo

1. Check **PR-STACK**: `docs/plan/PR-STACK-core-v1.md`
2. Check/create **brief.md**: `docs/plan/pr-briefs/PR-XX-<slug>.md`
3. Follow **SDD flow**: `docs/plan/SDD-FLOW.md`
4. If gap detected: open **Spec Change Request** before continuing

## 7. Trazabilidad

```
brief.md (REQ-01..N) -> Issue (#NN) -> PR AC checklist -> Evidencia (test)
```

- 1 issue por PR con TODOS los REQs del brief
- Cada AC del brief = 1 checkbox en el PR
- Cada AC = evidencia documentada (test name, log, screenshot)
- PR description SIEMPRE linkea al brief.md

## 7.1 Vertical Delivery Agent (agentes autónomos)

> Vertical B2: pedidos a domicilio para restaurantes. Todo el código va en `apps/api/src/verticals/delivery/` detrás de `isDeliveryEnabled`.

- **Fuente de verdad:** `docs/delivery-agent/SPEC.md` (sustituye al brief.md para esta vertical) + `IMPLEMENTATION-PLAN.md` (slices = PR, tareas = commit ≤ 400 líneas).
- **Roles autónomos:** un Integrador (único dueño de git y de los archivos compartidos) + subagentes por Track con propiedad de archivos según `CONTRACTS.md` §3.
- **Gates:** BRIEF GATE ya aprobado por el owner (SPEC v1.0). VERIFICATION GATE = G-slice (auto-merge a `feat/delivery-agent`) y G-release (PR a `dev` con revisión humana).
- **Escalera de decisión y tiers de riesgo:** `docs/delivery-agent/MASTER-PROMPT.md` §4–§5.
- **Estado entre sesiones:** `docs/delivery-agent/STATUS.md`. Decisiones: `DECISIONS.md`.

## 8. References

- SDD Flow: `docs/plan/SDD-FLOW.md`
- Product spec: `docs/mvp-core-v1.md`
- Repo instructions: `.github/copilot-instructions.md`
- Role agents: `.github/agents/*.agent.md`
- Brief template: `docs/plan/PR-BRIEF-template.md`
- PR Stack: `docs/plan/PR-STACK-core-v1.md`
