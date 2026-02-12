# Workflow — PR Stack + PR Brief (Core V1)

Este repo usa un flujo híbrido:

- **PR Stack global**: define el roadmap (8–15 PRs) con dependencias.
- **PR Brief por PR**: especificación “1 página” antes de escribir código.

## Artefactos

- Stack: `docs/plan/PR-STACK-core-v1.md`
- Briefs: `docs/plan/pr-briefs/PR-XX-<slug>.md`
- Template: `docs/plan/PR-BRIEF-template.md`

## Secuencia (determinística)

1) **Planner**
   - Si no existe: genera/actualiza el Stack global.
   - Antes de cada PR: genera el Brief (objetivo, scope fence, paths, contratos, acceptance, comandos).

2) **Builder**
   - Implementa estrictamente lo definido en el Brief.
   - Agrega migraciones/tests según DoD.
   - Si descubre una diferencia con el Brief, NO “inventar” scope: documenta el gap y pide al Planner actualizar Brief/Stack.

3) **Reviewer**
   - Revisa contra: (a) Brief, (b) reglas del repo (`AGENTS.md`, `.github/copilot-instructions.md`).
   - Devuelve must-fix y tests faltantes.

4) **Planner**
   - Actualiza el Stack si hubo cambios reales (dependencias, split/merge de PRs, riesgos).

## Scope control

- El Brief debe incluir **✅ Included / ❌ Excluded** y **paths exactos** a tocar.
- Si algo no cabe en el PR actual, se empuja al siguiente PR del stack o se crea uno nuevo (y se registra en el Stack).
