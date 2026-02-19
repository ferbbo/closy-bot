# Brief — PR-14 — Channel Health + Status Management

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-14-channel-health-status-management.md`
> **Regla**: Máx 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Exponer endpoint de health check por canal para UI "Fix", con diagnóstico detallado, recomendaciones accionables, y operaciones de retry controladas con rate limiting para webhook subscription y refresh de estado desde Meta API.

## Scope fence

### ✅ Included

- Endpoint `GET /channels/:id/health` → `ChannelHealthDto` (status, webhookSubscribed, lastWebhookAt, recentErrors, recommendation).
- `ChannelHealthService` con métodos: `getHealth()`, `retryWebhookSubscription()`, `refreshChannelStatus()`.
- Extensión de schema `Channel`: `lastErrorAt`, `errorCount`.
- Endpoint `POST /channels/:id/retry-webhook` → retry webhook subscription con exponential backoff.
- Endpoint `POST /channels/:id/refresh-status` → re-fetch channel status desde Meta Graph API.
- Rate limiting con `@nestjs/throttler` (5 req/min por merchant para endpoints de retry).
- Recommendation logic basado en estado del canal: "resubscribe_webhook" | "refresh_credentials" | "check_permissions" | null.
- Guard: SessionAuthGuard + ownership check (channel.merchantId === session.merchantId).
- Retry con exponential backoff: 1s, 2s, 4s, hasta 3 intentos max.
- Error tracking: últimos 3 errores en `recentErrors` array (calculado, no persistido).
- Tests unit (health logic, retry backoff, recommendation) + e2e (health endpoint, ownership check, rate limit).
- Env vars: `CHANNEL_HEALTH_RATE_LIMIT_TTL`, `CHANNEL_HEALTH_RATE_LIMIT_MAX` (opcionales, defaults en código).

### ❌ Excluded

- Background jobs automáticos de health check (puede ser PR aparte con @nestjs/schedule).
- Alertas/notificaciones automáticas (email, Slack, etc.).
- UI/frontend (solo backend API).
- Histórico completo de errores persistido (solo últimos N en memoria/simple query).
- Auto-healing automático sin intervención manual (solo retry bajo demanda).
- Métricas de observabilidad avanzadas (Prometheus, Datadog).
- Webhook payload validation detallada (ya cubierto en PR-03.8).
- Channel pause/resume automático por errores (manual por ahora).

## Requisitos numerados

| ID     | Requisito                                                                                          | Issue | AC                    |
|--------|---------------------------------------------------------------------------------------------------|-------|-----------------------|
| REQ-01 | Extender modelo `Channel` con `lastErrorAt` y `errorCount`                                       | TBD   | AC-01                 |
| REQ-02 | Implementar `ChannelHealthService.getHealth()` con recommendation logic                           | TBD   | AC-02, AC-03          |
| REQ-03 | Endpoint `GET /channels/:id/health` con ChannelHealthDto                                          | TBD   | AC-04, AC-05          |
| REQ-04 | Implementar `retryWebhookSubscription()` con exponential backoff (max 3 intentos)                | TBD   | AC-06, AC-07          |
| REQ-05 | Endpoint `POST /channels/:id/retry-webhook` con rate limiting                                     | TBD   | AC-08, AC-09          |
| REQ-06 | Implementar `refreshChannelStatus()` → re-fetch desde Meta Graph API                             | TBD   | AC-10                 |
| REQ-07 | Endpoint `POST /channels/:id/refresh-status` con rate limiting                                    | TBD   | AC-11                 |
| REQ-08 | Guard ownership check: solo merchant owner puede acceder a su channel                             | TBD   | AC-12                 |
| REQ-09 | Rate limiting con @nestjs/throttler para endpoints de retry                                       | TBD   | AC-13, AC-14          |
| REQ-10 | Tests unit + e2e (health, retry, ownership, rate limit)                                          | TBD   | AC-15, AC-16, AC-17   |

## Paths a tocar (concretos)

- `prisma/schema.prisma` (extend Channel con lastErrorAt, errorCount)
- `prisma/migrations/*` (nueva migración)
- `apps/api/src/channels/channel-health.service.ts` (nuevo)
- `apps/api/src/channels/channel-health.service.spec.ts` (nuevo)
- `apps/api/src/channels/channel-health.controller.ts` (nuevo)
- `apps/api/src/channels/channel-health.controller.spec.ts` (nuevo)
- `apps/api/src/channels/dto/channel-health.dto.ts` (nuevo)
- `apps/api/src/channels/channels.module.ts` (agregar providers/controllers)
- `apps/api/src/channels/guards/channel-ownership.guard.ts` (nuevo guard)
- `apps/api/src/app.module.ts` (configurar ThrottlerModule si no existe)
- `apps/api/src/onboarding/meta-oauth.service.ts` (reusar subscribeWebhook helper o extraer a shared)
- `test/channel-health.e2e-spec.ts` (nuevo e2e test)
- `.env.example` (agregar vars de rate limit opcionales)

## Contratos / Interfaces

- Persistencia (Prisma/models):
  ```prisma
  model Channel {
    // ... campos existentes + PR-13 ...
    lastErrorAt DateTime? @map("last_error_at")
    errorCount  Int       @default(0) @map("error_count")
  }
  ```

- ChannelHealthDto:
  ```typescript
  interface ChannelHealthDto {
    channelId: string;
    status: 'connected' | 'pending' | 'error';
    webhookSubscribed: boolean;
    lastWebhookAt: string | null; // ISO timestamp
    recentErrors: string[]; // últimos 3 errores (statusReason histórico si existe)
    errorCount: number;
    lastErrorAt: string | null; // ISO timestamp
    recommendation: 'resubscribe_webhook' | 'refresh_credentials' | 'check_permissions' | null;
  }
  ```

- ChannelHealthService:
  ```typescript
  getHealth(channelId: string, merchantId: string): Promise<ChannelHealthDto>;
  retryWebhookSubscription(channelId: string, merchantId: string): Promise<{ success: boolean; message: string }>;
  refreshChannelStatus(channelId: string, merchantId: string): Promise<{ success: boolean; status: ChannelStatus }>;
  ```

- Endpoints:
  - `GET /channels/:id/health` → `ChannelHealthDto` (200) o 404/403
  - `POST /channels/:id/retry-webhook` → `{ success: boolean, message: string }` (200) o 404/403/429
  - `POST /channels/:id/refresh-status` → `{ success: boolean, status: string }` (200) o 404/403/429

- Recommendation logic:
  ```typescript
  function getRecommendation(channel: Channel): string | null {
    if (channel.status === 'pending') return null; // Still onboarding
    if (!channel.webhookSubscribed) return 'resubscribe_webhook';
    if (channel.status === 'error') {
      if (channel.statusReason?.includes('token')) return 'refresh_credentials';
      if (channel.statusReason?.includes('permission')) return 'check_permissions';
      return 'refresh_credentials'; // default
    }
    if (channel.errorCount > 5) return 'check_permissions';
    return null; // Healthy
  }
  ```

- Rate limiting config:
  ```typescript
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min
  ```

- Exponential backoff:
  ```typescript
  const delays = [1000, 2000, 4000]; // 1s, 2s, 4s
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 2) throw error; // Last attempt
      await sleep(delays[attempt]);
    }
  }
  ```

## Comportamiento

- Happy path (health check):
  1. Merchant autenticado → `GET /channels/{id}/health`
  2. Backend verifica ownership (channel.merchantId === session.merchantId)
  3. Backend fetch channel desde DB
  4. Backend calcula recommendation basado en status/webhookSubscribed/errorCount
  5. Backend retorna ChannelHealthDto

- Happy path (retry webhook):
  1. Merchant → `POST /channels/{id}/retry-webhook`
  2. Backend verifica ownership + rate limit
  3. Backend fetch channel (incluye credentials)
  4. Backend intenta subscription con backoff (max 3 intentos)
  5. Si éxito: update `webhookSubscribed=true`, `status=connected`, `errorCount=0`, reset `lastErrorAt`
  6. Si falla: update `errorCount++`, `lastErrorAt=now()`, `statusReason` con error
  7. Backend retorna `{ success, message }`

- Happy path (refresh status):
  1. Merchant → `POST /channels/{id}/refresh-status`
  2. Backend verifica ownership + rate limit
  3. Backend fetch channel credentials
  4. Backend query Meta Graph API: `GET /{phone_number_id}` con access_token
  5. Si 200: update `status=connected`, `errorCount=0`
  6. Si 401/403: update `status=error`, `statusReason="Invalid credentials"`
  7. Si 404: update `status=error`, `statusReason="Phone number not found"`
  8. Backend retorna `{ success, status }`

- Edge cases:
  - **Channel no existe**: 404 Not Found
  - **Channel de otro merchant**: 403 Forbidden (ownership check)
  - **Rate limit excedido**: 429 Too Many Requests + header `Retry-After`
  - **Retry webhook falla 3 veces**: retorna `{ success: false, message: "Failed after 3 attempts" }`, actualiza errorCount
  - **Meta API down**: refresh status retorna `{ success: false }`, no cambia status (preserva último conocido)
  - **Credentials inválidas en retry**: statusReason actualizado, recommendation="refresh_credentials"
  - **Sin sesión**: 401 Unauthorized (SessionAuthGuard)

## Acceptance Criteria (verificables)

| ID     | Criterio                                                                                     | Evidencia                                                                      |
|--------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| AC-01  | Migración crea campos `lastErrorAt` y `errorCount` en `channels`                           | test: `pnpm db:migrate` exitoso + schema validado                            |
| AC-02  | `getHealth()` retorna ChannelHealthDto con recommendation correcto                          | test unit: `channel-health.service.spec.ts` → `should return health dto`     |
| AC-03  | Recommendation logic: webhookSubscribed=false → "resubscribe_webhook"                       | test unit: `should recommend webhook resubscription`                          |
| AC-04  | `GET /channels/:id/health` retorna 200 con ChannelHealthDto                                | test e2e: `channel-health.e2e-spec.ts` → `should return channel health`      |
| AC-05  | Health endpoint con channelId inexistente retorna 404                                       | test e2e: `should return 404 for unknown channel`                            |
| AC-06  | `retryWebhookSubscription()` con éxito actualiza webhookSubscribed=true + errorCount=0     | test unit: mock Meta API success → verify DB update                           |
| AC-07  | Retry con fallo 3 veces retorna success=false y actualiza errorCount                        | test unit: mock Meta API failure → verify retry count + backoff              |
| AC-08  | `POST /channels/:id/retry-webhook` con éxito retorna 200 + success=true                    | test e2e: mock Meta API → `should retry webhook successfully`                |
| AC-09  | Retry endpoint con rate limit excedido retorna 429                                          | test e2e: 6 requests rápidos → 6to retorna 429                                |
| AC-10  | `refreshChannelStatus()` actualiza status desde Meta API                                    | test unit: mock Graph API response → verify status update                    |
| AC-11  | `POST /channels/:id/refresh-status` con 401 de Meta actualiza status=error                 | test e2e: mock Meta 401 → verify status=error + statusReason                 |
| AC-12  | Ownership check: merchant intenta acceder channel de otro merchant → 403                    | test e2e: seed 2 merchants, merchant A intenta health de channel B → 403     |
| AC-13  | Rate limiting configurado correctamente (5 req/min por merchant)                            | test unit: ThrottlerModule config verificado                                  |
| AC-14  | Rate limit es por merchant (no global): 2 merchants diferentes pueden operar simultáneamente| test e2e: 2 sessions concurrentes sin 429 mutuo                               |
| AC-15  | Unit test de exponential backoff funciona (1s, 2s, 4s)                                     | test unit: mock sleep, verify delays llamados correctamente                   |
| AC-16  | E2E test cubre todos los endpoints (health, retry, refresh)                                | test e2e: happy paths + edge cases                                            |
| AC-17  | Sin sesión en cualquier endpoint retorna 401                                                | test e2e: request sin cookie → 401 para todos los endpoints                  |

## Plan de pruebas

- Unit:
  - `ChannelHealthService`:
    - `getHealth()`: happy path + different statuses
    - Recommendation logic: pending, not subscribed, error with different statusReason, high errorCount
    - `retryWebhookSubscription()`: success, failure, backoff timing
    - `refreshChannelStatus()`: success, 401, 403, 404 responses from Meta
  - `ChannelOwnershipGuard`: ownership check logic
  - Exponential backoff helper: verify delays

- Integration/E2E:
  - `channel-health.e2e-spec.ts`:
    - `describe('GET /channels/:id/health')`:
      - Happy path: retorna health dto con recommendation
      - Channel no existe → 404
      - Channel de otro merchant → 403
      - Sin sesión → 401
    - `describe('POST /channels/:id/retry-webhook')`:
      - Happy path: mock Meta API success → webhookSubscribed actualizado
      - Fallo: mock error → success=false + errorCount incrementado
      - Rate limit: 6 requests → 6to es 429
      - Ownership: otro merchant → 403
    - `describe('POST /channels/:id/refresh-status')`:
      - Happy path: mock Meta 200 → status actualizado
      - Meta 401 → status=error + statusReason
      - Meta 404 → status=error
      - Rate limit: 6 requests → 429
    - `describe('Rate limiting per merchant')`:
      - 2 merchants concurrentes no interfieren (cada uno puede hacer 5 req)

- Manual (si aplica):
  - Verificar con Meta API real que refresh y retry funcionan en dev/staging.

## DoD

- [ ] Todos los AC tienen evidencia (tests pasan, verificables).
- [ ] Sin scope creep (solo lo del brief).
- [ ] Estado persistido en Postgres: Channel.lastErrorAt, Channel.errorCount.
- [ ] Idempotencia: retry operations son idempotentes (success si ya subscrito no falla).
- [ ] Guardrails: rate limit previene abuse; ownership check previene acceso cruzado.
- [ ] PII minimizada: no se loggean access_tokens; channelId/merchantId solo en debug.
- [ ] `pnpm lint` y `pnpm test` pasan.
- [ ] DB: migración incluida y backwards-compatible.
- [ ] `.env.example` actualizado con vars de rate limit opcionales.
- [ ] Docs: comentarios en código explican recommendation logic y backoff strategy.

## Constraints

- Guardrails: access_token nunca expuesto en responses; rate limit previene abuse.
- PII: phone numbers maskados en logs.
- Security: ownership check obligatorio en todos los endpoints; SessionAuthGuard global.
- Performance: backoff total máximo = 1+2+4 = 7s por retry operation (aceptable para operación manual).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Rate limit demasiado bajo (5/min) frustra usuarios legítimos | Configurable via env var; monitorear uso real en producción; ajustar si necesario |
| Exponential backoff muy corto (max 4s) no suficiente si Meta lento | 3 intentos con 7s total es balance razonable para operación manual; si falla, usuario puede reintentar después |
| Error count incrementa indefinidamente sin reset | Reset a 0 on success; future PR puede agregar auto-decay o cap |
| Meta API cambia estructura de error responses | DTO validation estricta; catch-all para errores inesperados con log detallado |
| Ownership check race condition (merchant ownership cambia) | Channel ownership no cambia en V1 (no hay transfer); future PR con locks si necesario |
| recentErrors array puede crecer sin límite | Calculado on-the-fly (últimos 3 errors desde statusReason); no persiste array |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| - | - | - |
