# Resumen

(2-5 lineas: que cambia y por que.)

## Brief (OBLIGATORIO)

- **Link/ruta al brief**: `docs/plan/pr-briefs/PR-XX-<slug>.md`
- **Status del brief**: `APPROVED` / `AMENDED`

> Sin link a brief APPROVED = NO merge.

## Scope fence

### Included

- 

### Excluded

- 

## Cambios principales

- 

## Trazabilidad: Requisitos -> AC -> Evidencia

| REQ-ID | AC-ID | Descripcion | Evidencia (test/log/screenshot) |
|--------|-------|-------------|-------------------------------|
| REQ-01 | AC-01 | | test: `describe(...)` |
| REQ-02 | AC-02 | | |

## AC Checklist (del brief)

- [ ] AC-01: 
- [ ] AC-02: 

## DoD Checklist (Core V1)

- [ ] Sin scope creep (solo lo del brief)
- [ ] Todos los AC tienen evidencia documentada arriba
- [ ] Estado persistido en Postgres (sin logica solo en memoria)
- [ ] Idempotencia:
  - [ ] Inbound messages dedupe por `message_id` (si aplica)
  - [ ] Payment callbacks idempotentes por `payment_intent_id` (si aplica)
- [ ] Guardrails: el bot NO inventa precio/stock/politicas/ETA
- [ ] Seguridad/PII: no logs con PII crudo; secrets fuera del repo; inputs validados
- [ ] DB: constraints/indices/migraciones incluidas (si aplica)
- [ ] Tests:
  - [ ] Unit tests para logica critica
  - [ ] Integration/E2E para duplicados/reintentos (si aplica)
- [ ] Observabilidad minima: logs estructurados con `conversation_id`/`order_id` (si aplica)
- [ ] `.env.example` actualizado (si hay config nueva)

## Comandos para validar

```bash
pnpm lint
pnpm test
# (si aplica) pnpm db:migrate
```

## Spec Change Log (si hubo cambios post-aprobacion)

| Fecha | REQ/AC afectado | Cambio | SCR Issue |
|-------|-----------------|--------|-----------|
| | | | |

## Riesgos

- 

## Screenshots/Outputs (si aplica)

- 
