# Resumen

(2–5 líneas: qué cambia y por qué.)

## PR Brief

- Link/ruta al brief: `docs/plan/pr-briefs/PR-XX-<slug>.md`

## Scope fence

### ✅ Included

- 

### ❌ Excluded

- 

## Cambios principales

- 

## Evidencia / Cómo probar

- Comandos:
  - `pnpm lint`
  - `pnpm test`
  - (si aplica) `pnpm db:migrate`

## DoD / Checklist (Core V1)

- [ ] Sin scope creep (solo lo del PR Brief)
- [ ] Estado persistido en Postgres (sin lógica solo en memoria)
- [ ] Idempotencia:
  - [ ] Inbound messages dedupe por `message_id` (si aplica)
  - [ ] Payment callbacks idempotentes por `payment_intent_id` (si aplica)
- [ ] Guardrails: el bot NO inventa precio/stock/políticas/ETA; confirmaciones transaccionales desde servicios
- [ ] Seguridad/PII: no logs con PII crudo; secrets fuera del repo; inputs validados
- [ ] DB: constraints/índices/migraciones incluidas cuando aplique
- [ ] Tests:
  - [ ] Unit tests para lógica crítica
  - [ ] Integration/E2E para duplicados/reintentos donde aplique
- [ ] Observabilidad mínima: logs estructurados con `conversation_id`/`order_id` cuando aplique

## Notas de riesgo

- 

## Screenshots/Outputs (si aplica)

- 
