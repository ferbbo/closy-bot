# Workflow — SDD + PR Stack (Core V1)

> Flujo Spec-Driven Development con PR stacks.
> Detalle completo: `docs/plan/SDD-FLOW.md`

## Principio

**La spec (brief.md) es la fuente de verdad. Todo se verifica contra ella.**

## Artefactos

- Flujo SDD: `docs/plan/SDD-FLOW.md`
- Stack: `docs/plan/PR-STACK-core-v1.md`
- Briefs: `docs/plan/pr-briefs/PR-XX-<slug>.md`
- Template: `docs/plan/PR-BRIEF-template.md`

## Secuencia (spec-locked)

### Fase 1: Spec (antes de codear)

1. **Architect** — tech design + entrada en PR-STACK
2. **Planner** — genera brief.md con status `DRAFT`
3. **BRIEF GATE** — Humano aprueba brief — status `APPROVED`

### Fase 2: Setup (post-aprobacion)

4. **Planner** — crea issues (1:1 con REQs del brief) + branch + sync

### Fase 3: Build (spec-locked)

5. **Builder** — implementa SOLO lo del brief
6. Si falta info — **Spec Change Request** — Planner actualiza — Humano re-aprueba
7. **Builder <> Reviewer** — iteracion hasta LGTM

### Fase 4: Ship (merge)

8. **Builder** — push + crea PR con checklist AC/DoD
9. **VERIFICATION GATE** — Humano verifica evidencia por AC — merge

## Gates

| Gate | Quien aprueba | Que bloquea |
|------|---------------|-------------|
| BRIEF GATE | Humano | No branch, no issues, no codigo sin brief APPROVED |
| VERIFICATION GATE | Humano | No merge sin evidencia completa por AC + DoD |

## Scope control

- Brief incluye **Included / Excluded**, **REQs numerados** y **paths exactos**.
- Si algo no cabe — nuevo PR en el stack (y se registra).
- Si algo falta — Spec Change Request (no se improvisa).

## Trazabilidad

```
brief.md (REQ-01) -> Issue (#NN) -> PR AC checklist -> Evidencia (test)
```
