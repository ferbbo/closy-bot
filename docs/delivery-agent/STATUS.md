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
| Prisma engines (`binaries.prisma.sh`) | ✅ disponibles desde run-20261127-2008 (`pnpm db:generate` y `db push` funcionan) | Si vuelve a fallar: ver "Generar cliente" |
| Groq / Meta | ❌ sin credenciales y **no se usan** (Tier 3). Conectores MCP de Meta (Social Technologies y WhatsApp Business Tools) disponibles **solo** en la sesión de planeación del owner, no en las corridas | `FakeLlmProvider` / fakes de media + **Meta Sandbox** (S1.5) |

**Generar cliente (para tsc + unit), funciona sin engines:**
```bash
touch /tmp/fake-engine && chmod +x /tmp/fake-engine
PRISMA_SCHEMA_ENGINE_BINARY=/tmp/fake-engine PRISMA_QUERY_ENGINE_LIBRARY=/tmp/fake-engine \
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate --no-engine --schema=prisma/schema.prisma
```
**`.env` local para e2e (no se commitea):** copiar `apps/api/.env.example` a `apps/api/.env` y a `.env`, poner valores ficticios a las variables vacías (`sed -E 's/^([A-Z_]+)=$/\1=dummy-test-value/'`), borrar las líneas `R2_*` y `NODE_ENV=test`. Correr cada G-slice sobre una BD nueva (`DROP/CREATE DATABASE`, `prisma db push --skip-generate`) y con `--runInBand --forceExit` y un sequencer alfabético para que la lista de fallos sea comparable.
**E2E:** primero intenta `pnpm db:generate && pnpm db:push`. Si falla con 403 de `binaries.prisma.sh`, los e2e son `BLOCKED-ENV`: aplica la degradación de IMPLEMENTATION-PLAN §1 y anótalo en el log.

## Baseline (rama `dev` @ dcd6783, 2026-11-27)
- `tsc --noEmit` (api): ✅ 0 errores (con el cliente generado como arriba).
- Unit: 87/89 suites, 991/996 tests. **Fallos preexistentes (no son de esta vertical, no se arreglan salvo que bloqueen):**
  - `src/onboarding/onboarding.service.spec.ts`: 4 tests de `getProgress`/percentage
  - `src/persistence/repositories/outbox.repository.spec.ts`: `claimBatch › SKIP LOCKED`
- E2E (medido en run-20261127-2008, engines disponibles, BD nueva con `db push`, orden alfabético determinista): 9/27 suites, 164/288 tests, **121 fallos preexistentes** (limpieza con FK `categories_merchant_id_fkey`, `api_key` duplicada entre suites, FTS legacy `search_text_weighted` sin trigger/tsvector no deserializable). Con orden por defecto de jest los fallos varían (115–124) por contaminación entre suites. Comparación de G-slice: lista de tests fallidos idéntica a esta baseline.
- Al cierre de run-20261127-2008: unit 1621/1626 (mismos 5 fallos), e2e 199/323 (mismos 121 fallos + 35 tests nuevos de la vertical en verde), idéntico con `FEATURES_MODE=mvp` y con `FEATURES_MODE=dev DELIVERY_ENABLED=true`.

## Slices
| Slice | Track | Estado | PR | Commits | AC cubiertos | Notas |
|---|---|---|---|---|---|---|
| S1.1 | Integrador | MERGED | #138 | 6 | AC-01 (parcial), AC-02 (schema) | schema aditivo, flag, router, contratos, seed demo |
| S1.2 | B | MERGED | #141 | 7 | AC-02, AC-10/11/12 (base), AC-41 (función) | preset restaurante vacío (D-024) |
| S1.3 | C | MERGED | #140 | 4 | base AC-03/04/07 | generateWithTools, generateJson, FakeLlm, runToolLoop |
| S1.4 | A | MERGED | #142 | 10 | AC-34, AC-35 (parcial), AC-36, AC-37 (base), AC-38 a/b/e | WABA DTO (D-027), WHATSAPP_SANDBOX (D-028) |
| S1.5 | Integrador | MERGED | #139 | 7 | AC-38 a–d | Meta Sandbox + DEMO.md |
| S2.1 | A | MERGED | #144 | 6 | AC-05/06/07/09/39/40/42 (base) | matcher, menú, consultar_negocio, fallback parser |
| S2.2 | B | MERGED | #143 | 6 | AC-04, AC-08, AC-03/14 (parcial) | notas + extras en cart/checkout (D-031) |
| S2.3 | Integrador | MERGED | #145 | 9 | AC-03, 04, 05, 06, 07, 10, 22, 23, 33, 35, 39, 40, 41 | agente + handler + e2e delivery-order |
| S3.1 | A | MERGED | #147 | 5 | AC-11, AC-12, AC-32 (parcial) | CheckoutDraftStore, DeliveryQuoteService, fijar_entrega, cotizar_domicilio |
| S3.2 | B | MERGED | #148 | 5 | AC-10, AC-13, AC-24 (base) | fijar_pago, guard de horario, AmountLimitGuard |
| S3.4 | C | MERGED | #146 | 5 | AC-30 | registry + Noop/Fake + kit de contrato + PosOrderSink |
| S3.3 | Integrador | MERGED | #149 | 7 | AC-14, AC-15, AC-24, AC-30, AC-32, AC-37 | resumen/confirmar, comanda, ORDER_SINKS, e2e delivery-checkout |
| S4.1 | A | MERGED | #151 | 5 | AC-16, AC-34 (notifier), AC-20 (cableado) | lifecycle + notifier + delegación de comandos (D-042); e2e lifecycle en PR #154 (IN_REVIEW) |
| S4.2 | B | MERGED | #152 | 3 | AC-17, AC-18, AC-19 | estado/cancelar/repetir; e2e customer en PR #154 (IN_REVIEW) |
| S4.3 | C | MERGED | #150 | 4 | AC-20, AC-21 | ⚠️ criterio de facturable (§0.2) a revisar (D-041) |
| S5.0 | Integrador | MERGED | #153 | 4 | — (base de AC-26/27/31) | mergeado manualmente por el owner |
| S5.1 | A | IN_REVIEW(#156) | #156 | 3 | AC-25 | G-slice verde; merge denegado por el entorno → merge humano (D-052) |
| S5.2 | B | IN_REVIEW(#155) | #155 | 3 | AC-26 | G-slice verde; incluye fix DTO `audio.voice` (D-050) |
| S5.3 | C | IN_REVIEW(#157) | #157 | 5 + merge de S5.2 | AC-27, AC-31 | G-slice verde; mergear **después** de #155 |
| S5.4 | C | IN_REVIEW(#159) | #159 | 7 | AC-28 | apilado sobre #157 (base `da/S5.3-image`); G-slice verde; ⚠️ D-054/D-055 |
| S5.5 | Integrador | IN_REVIEW(#158) | #158 | 3 | AC-29, AC-01 | T1 journey e2e + T3 docs + T2 integración en seco (fix del harness para S5.4, D-057); apilado sobre #154 (base `da/S4-e2e-debt`). Falta T4 (#137) tras los merges |

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
- **BLOQUEANTE para el release (S5.5-T4):** el entorno sigue denegando `merge_pull_request` ("Destructive or Unwanted Actions"). Esta corrida no intentó rodearlo (D-052). Hay 4 PRs verificados, con G-slice verde y la misma lista de fallos que la baseline, esperando merge humano a `feat/delivery-agent`, en este orden:
  1. **#154**: e2e `delivery-lifecycle` + `delivery-customer` (AC-16..19). Solo tests.
  2. **#155**: S5.2 voz (AC-26) + fix del DTO `audio.voice`. ⚠️ Sin ese fix, las notas de voz reales reciben 400.
  3. **#156**: S5.1 debounce (AC-25). ⚠️ Nueva variable `DELIVERY_DEBOUNCE_MS` y cambio en el controlador legacy.
  4. **#157**: S5.3 imagen (AC-27, AC-31). Incluye el merge de S5.2, así que va **después de #155**.
  5. **#158**: S5.5 journey e2e (AC-29) + docs. Base `da/S4-e2e-debt` → después de #154, cambiar la base a `feat/delivery-agent`.
  6. **#159**: S5.4 botón Sí/No + `SEND_IMAGE` + `ver_foto_producto` (AC-28). Base `da/S5.3-image` → después de #157, cambiar la base. ⚠️ D-054 (enum aditivo), D-055 (DTO `interactive`).
  Re-verificado en run-20261128-0208: `merge_pull_request` sigue denegado (un intento sobre #154, sin rodeos).
  **run-20261128-0408:** integración local en seco de los 6 PRs en este orden: 0 conflictos; unit 1727/1732 y e2e 225/349 con la lista de fallos idéntica a la baseline (también en modo mvp). Se corrigió una incompatibilidad #158↔#159 en el harness e2e (commit `38efbbd` en #158, D-057). El stack queda listo para mergear en orden. El merge sigue denegado (un intento sobre #154).
  Verificado en run-20261128-0408 que #156 y #157 no chocan (git los mergea solo).
  **run-20261128-0609:** sin merges del owner (heads de #154–#159 sin cambios desde run-0408). Un intento de merge sobre #154 → denegado otra vez. No se re-corrió la verificación: el código no cambió.
- Alternativa: ajustar el permiso del entorno para `merge_pull_request` en las corridas.
- Hallazgo legacy: Meta envía `from` sin "+", y el orquestador compara exacto contra `merchant.whatsappNumber`. El seed demo guarda "+57…", así que el encargado no se reconoce (el e2e lo normaliza). Conviene normalizar en settings u onboarding.

Revisar en el PR final (⚠️ Tier 2/criterio):
- D-041: criterio de "pedido facturable" usado por `reporte` (§0.2 no tiene campo de confirmación explícita; se usa `createdAt` y cancelación < 24 h).
- D-016: `db push` en producción pedirá `--accept-data-loss` por el unique nuevo de `cart_items` (superconjunto del anterior, no hay pérdida real).
- Deuda: unit spec dedicado de `confirm.tools`; `formatCop`/`paymentInstructions`/helper de draft duplicados; logs legacy de búsqueda con texto del cliente (PII) en `CatalogService`/`ProductRepository`.

## Log de corridas
| Run | Inicio | Fin | Slices tocados | Resultado | Siguiente |
|---|---|---|---|---|---|
| plan | 2026-11-27 16:40 | 2026-11-27 17:20 | docs | SPEC, PLAN, CONTRACTS, MASTER-PROMPT, CLAUDE.md · PR #137 (draft → dev) | Run 1: S1.1 |
| run-20261127-2008 | 2026-11-27 20:08 | 2026-11-27 21:26 | S1.1–S1.5, S2.1–S2.3, S3.1–S3.4, S4.1–S4.3 (15 slices, PR #138–#152) | ✅ F1–F4 MERGED. Lock previo (run-20261127-1801) abandonado >110 min. Engines Prisma disponibles → e2e reales; baseline e2e medida (121 fallos preexistentes) | Run siguiente: S5.0 (Integrador) → S5.1 ∥ S5.2 ∥ S5.3; pendientes e2e lifecycle/customer |
| run-20261127-2210 | 2026-11-27 22:10 | 2026-11-27 22:28 | S5.0 (T1-T4 completos, PR #153 abierto, no mergeado) | ⚠️ BLOCKED-HUMAN: `merge_pull_request` denegado por el clasificador de auto-mode del entorno (ver §Bloqueos). Entorno verificado contra baseline (tsc 0 errores, unit 1640/1645 mismos 5 fallos preexistentes + 19 nuevos en verde, engines Prisma disponibles, e2e sin regresión en `whatsapp-webhook*`/`delivery-*`/`whatsapp-onboarding`). No se arrancaron S5.1/S5.2/S5.3 (dependen del código de S5.0, que solo vive en la rama `da/S5.0-media-plumbing` hasta que se mergee #153) | Mergear #153 manualmente; luego S5.1 ∥ S5.2 ∥ S5.3 |
| run-20261128-0008 | 2026-11-28 00:08 | 2026-11-28 00:26 | S5.1, S5.2, S5.3 (subagentes en paralelo) + e2e de deuda F4 | 🔄 4 PRs IN_REVIEW (#154–#157) con G-slice verde: unit 1680/1685 (con S5.2+S5.3), e2e sin regresión (mismos 121 fallos) y lo mismo en modo mvp. #153 ya estaba mergeado por el owner. ⚠️ El merge sigue denegado por el entorno (D-052) | Merge humano de #154→#155→#156→#157; después S5.4 (P1) ∥ S5.5 (release) |
| run-20261128-0208 | 2026-11-28 02:08 | 2026-11-28 02:26 | S5.4 (subagente, apilado sobre #157), S5.5-T1/T3 (Integrador, apilado sobre #154) | 🔄 2 PRs nuevos IN_REVIEW (#158, #159) con G-slice verde: S5.5 unit 1640/1645 · e2e 206/330 · S5.4 unit 1707/1712 · e2e 214/338, mismos 121 fallos de la baseline e idéntico en modo mvp. Baseline de la rama re-medida: unit 1640/1645, e2e 199/323 (sin cambios). Merge aún denegado (D-052) | Merge humano #154→#155→#156→#157→#158→#159; luego S5.5-T2/T4 (verificación integrada + PR #137 a ready) |
| run-20261128-0408 | 2026-11-28 04:08 | 2026-11-28 04:30 | S5.5-T2 (integración en seco de #154–#159) | 🔄 Sin merges del owner desde la corrida anterior. La integración local de los 6 PRs no tiene conflictos; encontró y corrigió un e2e roto entre #158 y #159 (harness → `SEND_INTERACTIVE`, `38efbbd` en #158). Integrado: unit 1727/1732 · e2e 225/349, la misma lista de fallos que la baseline (feat @ f091752: 199/323), idéntico en modos mvp y dev+delivery. Merge denegado (D-052) | Merge humano #154→#155→#156→#157→#158→#159; luego S5.5-T4 (#137 a ready). Si no hay merges, la corrida de las 04:00 del 29-nov hace T4 igual (release) |
| run-20261128-0609 | 2026-11-28 06:09 | 2026-11-28 06:09 | ninguno (solo chequeo de estado) | ⏸️ Sin merges del owner y heads de #154–#159 sin cambios → nada que integrar y ningún slice desbloqueado. Un intento de merge de #154: denegado (D-052). No se re-corrieron tsc/unit/e2e porque el código es idéntico al verificado en run-0408 | Merge humano #154→#155→#156→#157→#158→#159; luego S5.5-T4 (#137 a ready). Si no hay merges, la corrida de las 04:00 del 29-nov hace T4 igual |
