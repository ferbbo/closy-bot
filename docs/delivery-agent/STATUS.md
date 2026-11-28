# STATUS — Closy Delivery Agent

> Registro vivo. **Solo el Integrador lo escribe**, y lo hace al inicio (lock) y al final de cada corrida.
> Las corridas programadas leen este archivo **primero** para decidir qué hacer.

## Lock
```
LOCK: run-20261127-2008 since 2026-11-27T20:08:43-05:00
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
| Groq / Meta | ❌ sin credenciales y **no se usan** (Tier 3). Conectores MCP de Meta (Social Technologies y WhatsApp Business Tools) disponibles **solo** en la sesión de planeación del owner, no en las corridas | `FakeLlmProvider` / fakes de media + **Meta Sandbox** (S1.5) |

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
| S1.4 | A | TODO | | | | P0 mensajería + plantillas |
| S1.5 | Integrador | TODO | | | | P0 Meta Sandbox (en paralelo con S1.2–S1.4) |
| S2.1 | A | TODO | | | | |
| S2.2 | B | TODO | | | | |
| S2.3 | Integrador | TODO | | | | |
| S3.1 | A | TODO | | | | |
| S3.2 | B | TODO | | | | |
| S3.4 | C | TODO | | | | Puerto POS (P0) |
| S3.3 | Integrador | TODO | | | | después de S3.1, S3.2 y S3.4 |
| S4.1 | A | TODO | | | | |
| S4.2 | B | TODO | | | | |
| S4.3 | C | TODO | | | | |
| S5.0 | Integrador | TODO | | | | P0 media plumbing |
| S5.1 | A | TODO | | | | P0 debounce |
| S5.2 | B | TODO | | | | P0 voz |
| S5.3 | C | TODO | | | | P0 imagen producto + comprobante |
| S5.4 | C | TODO | | | | P1 botón |
| S5.5 | Integrador | TODO | | | | P0 release |

Estados: `TODO` · `IN_PROGRESS(run-id)` · `IN_REVIEW(PR#)` · `MERGED` · `BLOCKED-HUMAN(motivo)` · `BLOCKED-ENV(motivo)` · `CUT(P1 recortado)`

## App de prueba de Meta (para smoke tests manuales; las corridas NO la usan)
| Dato | Valor |
|---|---|
| App | **Closy-bot-qa** · App ID `1579465619796698` · modo desarrollo · el owner es admin |
| Portfolio | `927651103585574` ("Closy App") |
| Caso de uso | `WHATSAPP_BUSINESS_MESSAGING` configurado (número de prueba de Meta) |
| Webhook `whatsapp_business_account` | campos: `messages`, `account_update`, `message_template_status_update`, `template_category_update`, `phone_number_quality_update`, `message_template_quality_update` (los 4 últimos agregados el 2026-11-27 vía MCP Meta Social Technologies) |
| Callback | apunta a una URL ngrok antigua: hay que cambiarla a la URL pública vigente cuando se haga la prueba de humo |
| Secretos | App Secret, access token, WABA ID y Phone Number ID **no van en el repo**. El owner los carga como variables de entorno solo en su entorno local de prueba |

Las corridas programadas siguen usando **solo el Meta Sandbox (S1.5)**: no tienen ni deben tener credenciales reales. La prueba de humo contra Closy-bot-qa es manual y está en `DEMO.md` §"Prueba real con Closy-bot-qa" (la escribe S1.5-T4).

## Post-desarrollo (por cliente, NO lo hace el agente)
- [ ] Crear o vincular la app de Meta y el WABA del comercio (Embedded Signup existente, PR-13) y su número.
- [ ] Suscribir el webhook a los campos `messages`, `message_template_status_update`, `template_category_update` y `phone_number_quality_update`.
- [ ] Cargar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `META_*` reales en el entorno de producción.
- [ ] `scripts/register-whatsapp-templates.ts --apply` en el WABA del comercio y esperar la aprobación de las 10 plantillas.
- [ ] Verificación del negocio, medio de pago en Meta y prueba de humo con un número real.
- [ ] `GROQ_API_KEY` real + revisar los modelos `DELIVERY_*_MODEL`.

## Bloqueos para el humano
_(ninguno)_

## Log de corridas
| Run | Inicio | Fin | Slices tocados | Resultado | Siguiente |
|---|---|---|---|---|---|
| plan | 2026-11-27 16:40 | 2026-11-27 17:20 | docs | SPEC, PLAN, CONTRACTS, MASTER-PROMPT, CLAUDE.md · PR #137 (draft → dev) | Run 1: S1.1 |
