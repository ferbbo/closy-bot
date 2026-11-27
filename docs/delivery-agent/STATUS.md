# STATUS — Closy Delivery Agent

> Registro vivo. **Solo el Integrador lo escribe**, y lo hace al inicio (lock) y al final de cada corrida.
> Las corridas programadas leen este archivo **primero** para decidir qué hacer.

## Lock
```
LOCK: free
```
Formato cuando está tomado: `LOCK: run-<YYYYMMDD-HHmm> since <ISO-8601 -05:00>`.
Si existe un lock con menos de 110 minutos de antigüedad, la corrida nueva **no trabaja**: reporta "corrida anterior activa" y termina.
Un lock con más de 110 minutos se considera abandonado: se toma y se anota en el log.

## Ventana de ejecución
- Inicio: 2026-11-27 18:00 America/Bogota · Fin: 2026-11-29 06:00 America/Bogota (18 corridas, cada 2 h).
- Después del fin: la corrida no hace cambios, solo reporta "ventana cerrada".

## Entorno (verificado el 2026-11-27 por la sesión de planeación)
| Recurso | Estado | Cómo usarlo |
|---|---|---|
| Node 22 + pnpm 10 | ✅ | `pnpm install --frozen-lockfile` |
| Postgres 16 local | ✅ (docker **no** corre) | `pg_ctlcluster 16 main start`; rol/db: `su postgres -c "psql -c \"CREATE ROLE closy LOGIN SUPERUSER PASSWORD 'closy_dev_password';\" -c 'CREATE DATABASE closy_dev OWNER closy;'"` (ignorar "already exists"). `DATABASE_URL=postgresql://closy:closy_dev_password@localhost:5432/closy_dev` |
| Prisma engines (`binaries.prisma.sh`) | ❌ bloqueado por el proxy (403) a menos que el owner lo agregue a la allowlist de red | Ver "Generar cliente" |
| Groq / Meta | ❌ sin credenciales; no se usan | `FakeLlmProvider` y mocks |

**Generar cliente (para tsc + unit), funciona sin engines:**
```bash
touch /tmp/fake-engine && chmod +x /tmp/fake-engine
PRISMA_SCHEMA_ENGINE_BINARY=/tmp/fake-engine PRISMA_QUERY_ENGINE_LIBRARY=/tmp/fake-engine \
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate --no-engine --schema=prisma/schema.prisma
```
**E2E:** primero intenta `pnpm db:generate && pnpm db:push`. Si falla con 403 de `binaries.prisma.sh`, los e2e son `BLOCKED-ENV`: aplica la degradación de IMPLEMENTATION-PLAN §1 y anótalo en el log.

## Baseline (rama `dev` @ dcd6783, 2026-11-27)
- `tsc --noEmit` (api): ✅ 0 errores (con el cliente generado como arriba).
- Unit: 87/89 suites, 991/996 tests. **Fallos preexistentes (no son de esta vertical, no se arreglan salvo que bloqueen):**
  - `src/onboarding/onboarding.service.spec.ts`: 4 tests de `getProgress`/percentage
  - `src/persistence/repositories/outbox.repository.spec.ts`: `claimBatch › SKIP LOCKED`
- E2E: no ejecutado (engines bloqueados).

## Slices
| Slice | Track | Estado | PR | Commits | AC cubiertos | Notas |
|---|---|---|---|---|---|---|
| S1.1 | Integrador | TODO | | | | |
| S1.2 | B | TODO | | | | |
| S1.3 | C | TODO | | | | |
| S2.1 | A | TODO | | | | |
| S2.2 | B | TODO | | | | |
| S2.3 | Integrador | TODO | | | | |
| S3.1 | A | TODO | | | | |
| S3.2 | B | TODO | | | | |
| S3.3 | Integrador | TODO | | | | |
| S4.1 | A | TODO | | | | |
| S4.2 | B | TODO | | | | |
| S4.3 | C | TODO | | | | |
| S5.1 | A | TODO | | | | P0 |
| S5.2 | B | TODO | | | | P0 |
| S5.3 | C | TODO | | | | P1 |
| S5.4 | C | TODO | | | | P1 |
| S5.5 | Integrador | TODO | | | | P0 release |

Estados: `TODO` · `IN_PROGRESS(run-id)` · `IN_REVIEW(PR#)` · `MERGED` · `BLOCKED-HUMAN(motivo)` · `BLOCKED-ENV(motivo)` · `CUT(P1 recortado)`

## Bloqueos para el humano
_(ninguno)_

## Log de corridas
| Run | Inicio | Fin | Slices tocados | Resultado | Siguiente |
|---|---|---|---|---|---|
| plan | 2026-11-27 16:40 | 2026-11-27 17:50 | docs | SPEC, PLAN, CONTRACTS, MASTER-PROMPT, CLAUDE.md | Run 1: S1.1 |
