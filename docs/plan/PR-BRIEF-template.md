# PR Brief — PR-XX — <Título>

> Archivo: `docs/plan/pr-briefs/PR-XX-<slug>.md`
> 
> Regla: 1 página. Machine-actionable. Sin scope extra.

## Objetivo

(1–2 frases. Qué cambia y para qué.)

## Scope fence

### ✅ Included

- 

### ❌ Excluded

- 

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

## Acceptance criteria (verificables)

- [ ] 
- [ ] 

## Comandos para validar

- `pnpm lint`
- `pnpm test`
- (si aplica) `pnpm db:migrate`

## Riesgos y mitigaciones

- 

## Notas

- Guardrails: el bot NO inventa precio/stock/políticas/ETA.
- PII: minimizar y evitar logs con datos sensibles.
