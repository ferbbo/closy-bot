# Brief — PR-XX — <Título>

> **Status**: `DRAFT` | `APPROVED` | `AMENDED`
> **Scope**: `MVP` | `B2` (si B2: indicar feature flag)
> **Archivo**: `docs/plan/pr-briefs/PR-XX-<slug>.md`
> **Issue**: [#NN](link) (1 issue con todos los REQs)
> **Parallel Mode**: `false` (default) | `true` (worktree)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

(1–2 frases. Qué cambia y para qué.)

## Scope fence

### ✅ Included

- 

### ❌ Excluded

- 

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | | [#NN](link) | AC-01 |
| REQ-02 | | [#NN](link) | AC-02 |

> **Nota**: Todos los REQs apuntan al mismo issue (#NN).

## Paths a tocar (concretos)

- 

## Contratos / Interfaces

- Endpoints (si aplica):
  - 
- DTOs / payloads:
  - 
- Persistencia (Prisma/models):
  - 
- Idempotencia (si aplica):
  - Key:
  - Constraint unique / estrategia:

## Comportamiento

- Happy path:
  - 
- Edge cases:
  - Duplicados
  - Reintentos
  - Out-of-order (si aplica)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | | test: `describe(...)` / log / screenshot |
| AC-02 | | |

## Plan de pruebas

- Unit:
  - 
- Integration:
  - 
- Manual (si aplica):
  - 

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (sin lógica solo en memoria)
- [ ] Idempotencia implementada y testeada (si aplica)
- [ ] Guardrails: bot NO inventa precio/stock/políticas/ETA
- [ ] PII minimizada y sin logs de datos sensibles
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migrations incluidas (si aplica)

## Constraints

- Guardrails: el bot NO inventa precio/stock/políticas/ETA.
- PII: minimizar y evitar logs con datos sensibles.

## Riesgos y mitigaciones

- 

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| | | |
