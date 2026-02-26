# Brief — PR-MVP-01 — Feature Flags Infrastructure

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-MVP-01-feature-flags.md`
> **Issue**: [#102](https://github.com/ferbbo/closy-bot/issues/102)
> **Parallel Mode**: `false`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Implementar infraestructura de feature flags con kill-switch global (`FEATURES_MODE`) para separar features MVP de B2, habilitando deployments con flags desactivados en producción sin necesidad de excluir código.

## Scope fence

### ✅ Included

- `FeatureFlagsService` con kill-switch `FEATURES_MODE` (mvp|dev|full)
- Flags granulares: `MULTI_CHANNEL_ENABLED`, `INSTAGRAM_ENABLED`, `PLAYBOOK_EDITOR_ENABLED`
- Gating server-side: máximo 1 canal WhatsApp en modo MVP
- Frontend hook `useFeatures()` para consumo desde dashboard
- Actualización de `env.validation.ts` con nuevos campos
- Actualización de `.env.example` (API y Dashboard)
- Tests unitarios para `FeatureFlagsService`
- Documentación en `BACKEND-EXECUTION-GUIDE.md`

### ❌ Excluded

- Implementación de features B2 completas (Instagram OAuth, editor avanzado, multi-channel UI)
- Template Pack en DB (Bloque 7 — futuro)
- Flags adicionales no mencionados (se agregan en PRs futuros según necesidad)
- Cambios en UI de wizard (eso es PR-FE-OB-2)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear `FeatureFlagsService` en `apps/api/src/common/feature-flags/` con kill-switch global | TBD | AC-01, AC-02 |
| REQ-02 | Actualizar `env.validation.ts` con flags nuevos | TBD | AC-03 |
| REQ-03 | Gating server-side: bloquear creación de segundo canal en modo MVP | TBD | AC-04, AC-05 |
| REQ-04 | Frontend hook `useFeatures()` en `apps/dashboard/src/hooks/` | TBD | AC-06 |
| REQ-05 | Actualizar `.env.example` en API y Dashboard | TBD | AC-07 |
| REQ-06 | Tests unitarios para kill-switch y flags granulares | TBD | AC-08 |
| REQ-07 | Documentación en `BACKEND-EXECUTION-GUIDE.md` | TBD | AC-09 |

> **Nota**: Todos los REQs apuntan al mismo issue.

## Paths a tocar (concretos)

### Backend (API)
- `apps/api/src/common/feature-flags/feature-flags.service.ts` (nuevo)
- `apps/api/src/common/feature-flags/feature-flags.service.spec.ts` (nuevo)
- `apps/api/src/common/feature-flags/feature-flags.module.ts` (nuevo)
- `apps/api/src/common/config/env.validation.ts` (actualizar)
- `apps/api/src/onboarding/onboarding.service.ts` (agregar gating)
- `apps/api/src/app.module.ts` (importar FeatureFlagsModule)
- `apps/api/.env.example` (actualizar)

### Frontend (Dashboard)
- `apps/dashboard/src/hooks/use-features.ts` (nuevo)
- `apps/dashboard/.env.example` (actualizar)

### Documentación
- `docs/BACKEND-EXECUTION-GUIDE.md` (nueva sección)

## Contratos / Interfaces

### Backend Service

| Método | Retorno | Descripción |
|--------|---------|-------------|
| `isMultiChannelEnabled` | `boolean` | Permite múltiples canales por merchant (B2) |
| `isInstagramEnabled` | `boolean` | Habilita onboarding Instagram channel (B2) |
| `isPlaybookEditorEnabled` | `boolean` | Habilita editor avanzado de playbook (B2) |
| `isIndustriesEnabled` | `boolean` | Habilita selector de verticales (ropa/belleza/minimarket). MVP usa "Retail General" fijo |

**Regla kill-switch:**
- Si `FEATURES_MODE=mvp` → TODOS los flags B2 retornan `false` (override forzado)
- Si `FEATURES_MODE=dev` → flags respetan valores individuales de env vars
- Si `FEATURES_MODE=full` → flags respetan valores individuales (futuro post-B2)

### Environment Variables

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `FEATURES_MODE` | `'mvp' \| 'dev' \| 'full'` | `'mvp'` | Kill-switch global |
| `MULTI_CHANNEL_ENABLED` | `boolean` | `false` | Feature flag granular |
| `INSTAGRAM_ENABLED` | `boolean` | `false` | Feature flag granular |
| `PLAYBOOK_EDITOR_ENABLED` | `boolean` | `false` | Feature flag granular |
| `INDUSTRIES_ENABLED` | `boolean` | `false` | Feature flag granular (MVP usa retail general) |

### Frontend Hook

```typescript
interface FeatureFlags {
  isMultiChannelEnabled: boolean;
  isInstagramEnabled: boolean;
  isIndustriesEnabled: boolean;
  isPlaybookEditorEnabled: boolean;
}

export function useFeatures(): FeatureFlags;
```

**Variables públicas (Dashboard):**
```bash
NEXT_PUBLIC_FEATURES_MODE=mvp
NEXT_PUBLIC_MULTI_CHANNEL_ENABLED=false
NEXT_PUBLIC_INSTAGRAM_ENABLED=false
NEXT_PUBLIC_INDUSTRIES_ENABLED=false
NEXT_PUBLIC_PLAYBOOK_EDITOR_ENABLED=false
```

## Comportamiento

### Happy path

1. **Backend:** Merchant intenta crear segundo canal WhatsApp
2. `FeatureFlagsService.isMultiChannelEnabled` retorna `false` (modo MVP)
3. Service cuenta canales existentes con `ChannelRepository.findByMerchantId()`
4. Si `count >= 1` → lanzar `ForbiddenException('Multi-channel requires enterprise plan')`
5. Cliente recibe `403 Forbidden` con mensaje claro

### Frontend

1. Usuario entra al wizard o settings
2. `useFeatures()` lee `NEXT_PUBLIC_FEATURES_MODE`
3. Si `mode === 'mvp'` → no muestra botón "Conectar otro canal"
4. Si `mode === 'dev'` y flag habilitado → muestra opciones B2

### Edge cases

- **Kill-switch override:** Asegurar que `FEATURES_MODE=mvp` ignora configuraciones granulares erróneas
- **Backward compatibility:** Si un merchant existente tiene >1 canal (datos de prueba), NO eliminarlos. Solo bloquear nuevas creaciones
- **Env vars faltantes:** Si no están definidas, usar defaults (`false` para flags B2)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `FeatureFlagsService` creado con inyección de `ConfigService` | Archivo existe + test unitario pasa |
| AC-02 | Kill-switch funciona: `FEATURES_MODE=mvp` → todos flags B2 = false | test: `describe('FeatureFlagsService kill-switch')` |
| AC-03 | `env.validation.ts` validado con Joi para nuevas vars | test: `pnpm dev` levanta sin errores + vars incorrectas fallan |
| AC-04 | Gating en creación de canal: max 1 en MVP | test integration: intento de crear segundo canal → 403 |
| AC-05 | Merchant con 1 canal existente no puede crear otro en MVP | test integration con fixtures |
| AC-06 | Hook `useFeatures()` retorna flags correctos según env vars | test unitario (frontend) o manual |
| AC-07 | `.env.example` actualizado en API y Dashboard con defaults MVP | archivo diff muestra nuevas vars |
| AC-08 | Tests cubren modo `mvp`, `dev`, y flags individuales | `pnpm test` pasa con cobertura de FeatureFlagsService |
| AC-09 | Documentación en BACKEND-EXECUTION-GUIDE.md con ejemplos cURL | sección nueva con ejemplo de 403 |

## Plan de pruebas

### Unit tests (Backend)

```typescript
describe('FeatureFlagsService', () => {
  describe('Kill-switch mode=mvp', () => {
    it('forces all B2 flags to false even if env vars are true', () => {
      // FEATURES_MODE=mvp + MULTI_CHANNEL_ENABLED=true
      // expect(service.isMultiChannelEnabled).toBe(false)
    });
  });

  describe('mode=dev', () => {
    it('respects individual flag values', () => {
      // FEATURES_MODE=dev + MULTI_CHANNEL_ENABLED=true
      // expect(service.isMultiChannelEnabled).toBe(true)
    });
  });

  describe('default values', () => {
    it('defaults to mvp mode if not set', () => {
      // No FEATURES_MODE
      // expect(service mode).toBe('mvp')
    });
  });
});
```

### Integration tests (Backend)

```typescript
describe('OnboardingService with feature flags', () => {
  it('blocks second channel creation when mode=mvp', async () => {
    // Given: merchant has 1 channel
    // When: try to create another channel
    // Then: expect ForbiddenException with message
  });

  it('allows second channel when mode=dev and flag enabled', async () => {
    // Given: FEATURES_MODE=dev + MULTI_CHANNEL_ENABLED=true
    // When: create second channel
    // Then: success
  });
});
```

### Manual (Frontend)

1. Configurar `NEXT_PUBLIC_FEATURES_MODE=mvp`
2. Ingresar al wizard paso 1 (channel)
3. Conectar 1 canal WhatsApp
4. Verificar que no aparece botón "Conectar otro canal"
5. Cambiar a `NEXT_PUBLIC_FEATURES_MODE=dev` + `NEXT_PUBLIC_MULTI_CHANNEL_ENABLED=true`
6. Verificar que SÍ aparece la opción (si aplica en UI actual)

## DoD

- [x] Todos los AC tienen evidencia
- [x] Sin scope creep (solo lo del brief)
- [x] Estado persistido en Postgres: N/A (feature flags son read-only desde env)
- [x] Idempotencia implementada: N/A (no aplica)
- [x] Guardrails: bot NO inventa precio/stock/políticas/ETA: N/A (no afecta conversación)
- [x] PII minimizada: N/A (no maneja PII)
- [x] `pnpm lint` y `pnpm test` pasan
- [x] `npx tsc --noEmit` pasa (0 errores)
- [x] DB migrations: N/A (no hay cambios de schema)
- [x] API Consumer-First:
  - [x] Gating devuelve 403 con mensaje claro accionable
  - [x] Documentación actualizada con ejemplo cURL
- [x] `.env.example` actualizado (API + Dashboard)
- [x] Tests con `FEATURES_MODE=mvp` y `dev` pasan

## Constraints

- **No inventar features B2:** Solo implementar la infraestructura de flags. La lógica de features B2 vendrá en PRs futuros
- **Backward compatibility:** Merchants con múltiples canales existentes (si existen datos) NO se eliminan. Solo se bloquean nuevas creaciones
- **Default seguro:** `FEATURES_MODE` default es `mvp` (restrictivo) para producción

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Flag mal implementado expone B2 en MVP | Media | Alto | Tests de integración + CI con `FEATURES_MODE=mvp` |
| Confusión entre flags granulares y kill-switch | Baja | Medio | Documentación clara + comentarios en código |
| Frontend lee flags obsoletos (cache) | Baja | Bajo | Build-time vars (NEXT_PUBLIC_*) no cachean entre builds |
| Merchant existente con >1 canal rompe UI | Baja | Bajo | UI debe manejar lista genérica (no asumir 1 solo canal) |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-26 | Creación inicial (DRAFT) | Separación MVP/B2 según `mvp-separation.md` |
