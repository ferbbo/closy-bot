# CLAUDE.md — closy-bot

Lee primero `AGENTS.md`: guardrails, anti-patrones de TypeScript y la regla de feature flags. Ese archivo aplica completo.

## Mapa rápido
- `apps/api`: NestJS 10 + Prisma 5 (schema en `prisma/schema.prisma`, se aplica con `db push`; no hay migraciones). Es el backend, el webhook de WhatsApp, el orquestador y los workers.
- `apps/dashboard`: Next.js. No se toca en la vertical de domicilios salvo para compilar.
- `docs/mvp-core-v1.md`: producto base. `docs/plan/*`: SDD con briefs de los PR históricos.

## Vertical activa: Closy Delivery Agent (pedidos a domicilio para restaurantes)
- Spec, plan, contratos, estado y decisiones: `docs/delivery-agent/` (**empieza por `STATUS.md`**).
- Código: `apps/api/src/verticals/delivery/` (tiene su propio `CLAUDE.md`).
- Rama de integración: `feat/delivery-agent`. Ramas de slice: `da/S#-slug`. Nunca hay push a `dev` ni a `main`.
- Para esta vertical, el SDD de `docs/plan/SDD-FLOW.md` se sustituye por `docs/delivery-agent/IMPLEMENTATION-PLAN.md`. Los briefs aprobados son los slices del plan.

## Comandos
```bash
pnpm install --frozen-lockfile
# cliente Prisma sin acceso a binaries.prisma.sh: ver docs/delivery-agent/STATUS.md §Entorno
cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest && npx jest --config ./test/jest-e2e.json
FEATURES_MODE=mvp npx jest --config ./test/jest-e2e.json   # el comportamiento legacy no debe cambiar
```
