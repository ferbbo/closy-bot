# Brief — PR-13 — Meta Embedded Signup: WhatsApp Channel Onboarding

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-13-meta-embedded-signup-whatsapp.md`
> **Regla**: Máx 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Implementar onboarding self-service para que un merchant autenticado conecte su WhatsApp Business Account via Meta Embedded Signup (OAuth Authorization Code Flow), creando un `Channel` con WABA ID, Phone Number ID, y credentials válidas, con suscripción automática de webhooks.

## Scope fence

### ✅ Included

- Módulo `onboarding/` con `MetaOAuthController` y `MetaOAuthService`.
- Extensión de schema `Channel`: `wabaId`, `status` (enum: pending/connected/error), `statusReason`, `webhookSubscribed`, `lastWebhookAt`.
- Enum `ChannelStatus` en Prisma: `pending`, `connected`, `error`.
- Endpoints: `GET /onboarding/whatsapp/start`, `GET /onboarding/whatsapp/callback`, `POST /onboarding/whatsapp/:channelId/subscribe-webhook`.
- `MetaEmbeddedSignupProvider`: abstracción del OAuth flow de Meta.
- OAuth flow completo: start → redirect Meta → callback → exchange code → fetch WABA info → create/update Channel.
- anti-CSRF: cookie `meta_oauth_state` (httpOnly, 5min TTL) + validación en callback.
- Webhook subscription automática post-callback via Meta Graph API `POST /{waba_id}/subscribed_apps`.
- Endpoint retry manual de webhook subscription (rate limited).
- Guard: SessionAuthGuard en todos los endpoints (requiere merchant autenticado).
- Merchant linking: lookup por `session.merchantId`.
- Env vars: `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_REDIRECT_URI` (callback URL).
- Tests unit (exchange flow, webhook subscription, WABA fetch) + e2e (mock OAuth, happy path, state mismatch).
- Actualización de `.env.example` con nuevas variables y comentarios.

### ❌ Excluded

- Encrypt helper real para credentials (mantiene TODO comentado en código).
- Instagram OAuth flow (preparado en estructura pero no implementado).
- UI/frontend (solo backend API).
- Múltiples WABAs por merchant (1 channel = 1 phone number; merchant puede tener N channels, pero no cubierto en esta PR).
- Webhook auto-healing o retry automático de subscriptions (eso va en PR-14).
- PKCE (Proof Key for Code Exchange) — V1 usa state + app_secret suficiente para backend confidencial.
- Rate limiting global (se agregará en PR-14; solo retry endpoint tiene throttle básico).
- Revocación de tokens (future feature).

## Requisitos numerados

| ID     | Requisito                                                                                          | Issue | AC                    |
|--------|---------------------------------------------------------------------------------------------------|-------|-----------------------|
| REQ-01 | Extender modelo `Channel` con campos de WABA y estado                                            | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-01                 |
| REQ-02 | Crear enum `ChannelStatus` (pending/connected/error)                                             | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-01                 |
| REQ-03 | Implementar `MetaEmbeddedSignupProvider` con OAuth helpers                                       | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-02, AC-03          |
| REQ-04 | Endpoint `GET /onboarding/whatsapp/start` (redirect a Meta + state cookie)                       | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-04, AC-05          |
| REQ-05 | Endpoint `GET /onboarding/whatsapp/callback` (exchange code, fetch WABA, create Channel)         | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-06, AC-07, AC-08   |
| REQ-06 | Webhook subscription automática post-callback                                                    | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-09                 |
| REQ-07 | Endpoint `POST /onboarding/whatsapp/:channelId/subscribe-webhook` (retry manual)                | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-10                 |
| REQ-08 | Guards: SessionAuthGuard en todos los endpoints                                                  | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-11                 |
| REQ-09 | Idempotencia: `phone_number_id` ya existente → 409 si otro merchant, update si mismo merchant   | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-12                 |
| REQ-10 | Tests unit + e2e (OAuth mock, state validation, subscription)                                    | [#40](https://github.com/ferbbo/closy-bot/issues/40)   | AC-13, AC-14, AC-15   |

## Paths a tocar (concretos)

- `prisma/schema.prisma` (extend Channel, add ChannelStatus enum)
- `prisma/migrations/*` (nueva migración)
- `apps/api/src/onboarding/` (nuevo módulo)
  - `onboarding.module.ts`
  - `meta-oauth.controller.ts`
  - `meta-oauth.controller.spec.ts`
  - `meta-oauth.service.ts`
  - `meta-oauth.service.spec.ts`
  - `providers/meta-embedded-signup.provider.ts`
  - `providers/meta-embedded-signup.provider.spec.ts`
  - `dto/waba-info.dto.ts`
  - `dto/channel-onboarding.response.dto.ts`
- `apps/api/src/app.module.ts` (importar OnboardingModule)
- `apps/api/src/persistence/repositories/channel.repository.ts` (agregar métodos si necesarios)
- `apps/api/src/common/config/env.validation.ts` (validar env vars Meta)
- `test/whatsapp-onboarding.e2e-spec.ts` (nuevo e2e test)
- `.env.example`
- `README.md` o `docs/setup/meta-embedded-signup.md` (documentación de setup)

## Contratos / Interfaces

- Persistencia (Prisma/models):
  ```prisma
  enum ChannelStatus {
    pending
    connected
    error
  }

  model Channel {
    // ... campos existentes PR-03.11 ...
    wabaId            String?        @map("waba_id") // WhatsApp Business Account ID
    status            ChannelStatus  @default(pending)
    statusReason      String?        @map("status_reason") @db.Text
    webhookSubscribed Boolean        @default(false) @map("webhook_subscribed")
    lastWebhookAt     DateTime?      @map("last_webhook_at")
  }
  ```

- MetaEmbeddedSignupProvider:
  ```typescript
  interface MetaTokenResponse {
    access_token: string;
    token_type: string;
  }

  interface MetaWabaInfo {
    id: string; // WABA ID
    name: string;
    phoneNumbers: Array<{
      id: string; // Phone Number ID
      displayPhoneNumber: string; // +57...
      verifiedName: string;
    }>;
  }

  class MetaEmbeddedSignupProvider {
    getAuthorizationUrl(state: string, redirectUri: string): string;
    exchangeCodeForToken(code: string, redirectUri: string): Promise<MetaTokenResponse>;
    fetchWabaInfo(accessToken: string, wabaId?: string): Promise<MetaWabaInfo>;
    subscribeWebhook(wabaId: string, accessToken: string, callbackUrl: string, verifyToken: string): Promise<{ success: boolean }>;
  }
  ```

- Endpoints:
  - `GET /onboarding/whatsapp/start` → 302 redirect a Meta OAuth + Set-Cookie `meta_oauth_state`
  - `GET /onboarding/whatsapp/callback?code=X&state=Y` → exchange, create Channel, subscribe webhook → 302 /dashboard?status=success
  - `POST /onboarding/whatsapp/:channelId/subscribe-webhook` → retry subscription → `{ success: boolean, message: string }`

- Idempotencia:
  - State cookie (UUID v4) previene CSRF.
  - `UNIQUE(type, externalId)` en Channel (existente PR-03.11) previene duplicados por `phone_number_id`.
  - Si `phone_number_id` ya existe para otro merchant → 409 Conflict.
  - Si `phone_number_id` ya existe para mismo merchant → update credentials + status (idempotente).

## Comportamiento

- Happy path:
  1. Merchant autenticado → `GET /onboarding/whatsapp/start`
  2. Backend genera state UUID, setea cookie `meta_oauth_state` (httpOnly, 5min TTL)
  3. Backend construye Meta OAuth URL:
     - `https://www.facebook.com/v18.0/dialog/oauth`
     - `client_id=META_APP_ID`
     - `redirect_uri=META_REDIRECT_URI`
     - `config_id=META_CONFIG_ID` (pre-configurado en Meta App Dashboard)
     - `state={uuid}`
     - `scope=whatsapp_business_management,whatsapp_business_messaging`
  4. Backend retorna 302 redirect a Meta
  5. Merchant autoriza en Meta (Embedded Signup flow)
  6. Meta redirect → `GET /onboarding/whatsapp/callback?code=X&state=Y`
  7. Backend valida state contra cookie → 403 si mismatch
  8. Backend exchange code por `access_token` (POST a Meta token endpoint)
  9. Backend fetch WABA info: `GET /debug_token` o `GET /{waba_id}` + list phone numbers
  10. Backend crea Channel:
      - `merchantId`: desde session
      - `type`: WHATSAPP
      - `externalId`: `phone_number_id`
      - `displayName`: `verifiedName` del número
      - `credentials`: `{ accessToken, wabaId, phoneNumberId, appSecret: META_APP_SECRET }`
      - `status`: pending
      - `isActive`: true
  11. Backend subscribe webhook: `POST /{waba_id}/subscribed_apps` con:
      - `override_callback_url`: webhook URL backend
      - `verify_token`: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
      - `access_token`: del paso 8
  12. Si subscription éxito → update Channel: `status=connected`, `webhookSubscribed=true`
  13. Si subscription falla → update Channel: `status=connected`, `webhookSubscribed=false`, `statusReason="Webhook subscription failed"`
  14. Backend clear cookie `meta_oauth_state`
  15. Backend retorna 302 redirect a `/dashboard?status=success&channelId={id}`

- Edge cases:
  - **State mismatch**: 403 Forbidden + log warning (posible CSRF attack)
  - **Code inválido**: Meta retorna error en exchange → log error → redirect `/dashboard?status=error&reason=invalid_code`
  - **WABA fetch falla**: log error → redirect `/dashboard?status=error&reason=waba_fetch_failed`
  - **Phone number ya conectado (otro merchant)**: 409 Conflict → `{ error: 'Phone number already connected to another merchant' }`
  - **Phone number ya conectado (mismo merchant)**: update credentials + status → 200 OK (idempotente)
  - **Webhook subscription falla**: Channel se crea con `status=connected` pero `webhookSubscribed=false` → merchant puede usar retry endpoint
  - **Sin state cookie**: 403 Forbidden (CSRF protection)
  - **Merchant no autenticado**: 401 Unauthorized (SessionAuthGuard)

## Acceptance Criteria (verificables)

| ID     | Criterio                                                                                     | Evidencia                                                                      |
|--------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| AC-01  | Migración crea campos nuevos en `channels` + enum `ChannelStatus`                          | test: `pnpm db:migrate` exitoso + schema validado                            |
| AC-02  | `MetaEmbeddedSignupProvider.getAuthorizationUrl()` retorna URL válida con state             | test: `meta-embedded-signup.provider.spec.ts` → `should generate auth URL`   |
| AC-03  | `exchangeCodeForToken()` exchange code por access_token (mock fetch)                        | test: `meta-embedded-signup.provider.spec.ts` → `should exchange code`       |
| AC-04  | `GET /onboarding/whatsapp/start` setea state cookie y redirect a Meta                      | test e2e: `whatsapp-onboarding.e2e-spec.ts` → `should redirect to Meta`      |
| AC-05  | State cookie tiene atributos correctos (httpOnly, Secure en prod, 5min TTL)                | test e2e: verificar headers Set-Cookie                                        |
| AC-06  | `GET /callback` con state válido exchange code y crea Channel                              | test e2e: mock Meta API → `should create channel on callback`                |
| AC-07  | Callback con state mismatch retorna 403 Forbidden                                           | test e2e: `should reject callback with invalid state`                        |
| AC-08  | Channel creado incluye `wabaId`, `phoneNumberId` en credentials, status=pending inicial    | test e2e: verificar DB query post-callback                                    |
| AC-09  | Webhook subscription automática actualiza `webhookSubscribed=true` si éxito                | test unit: mock Graph API → `should subscribe webhook post-callback`         |
| AC-10  | Endpoint retry de webhook subscription funciona (POST con channelId)                        | test e2e: `should retry webhook subscription manually`                       |
| AC-11  | Todos los endpoints requieren SessionAuthGuard (401 sin sesión)                            | test e2e: request sin cookie → 401                                            |
| AC-12  | `phone_number_id` duplicado para otro merchant retorna 409 Conflict                        | test e2e: seed 2 merchants, intento de conectar mismo número → 409           |
| AC-13  | `phone_number_id` duplicado para mismo merchant actualiza credentials (idempotente)        | test e2e: callback 2 veces con mismo merchant → 2nd success                  |
| AC-14  | Unit test de `MetaOAuthService.handleCallback()` cubre happy path                          | test: `meta-oauth.service.spec.ts` → `should handle callback successfully`   |
| AC-15  | Unit test de subscription falla → status=connected pero webhookSubscribed=false            | test: `meta-oauth.service.spec.ts` → `should handle subscription failure`    |

## Plan de pruebas

- Unit:
  - `MetaEmbeddedSignupProvider`: getAuthorizationUrl, exchangeCodeForToken, fetchWabaInfo, subscribeWebhook (todos con mocked fetch).
  - `MetaOAuthService`: startOnboarding, handleCallback (mock provider).
  - `MetaOAuthController`: start, callback, retryWebhook (mock service).

- Integration/E2E:
  - `whatsapp-onboarding.e2e-spec.ts`:
    - `describe('Onboarding start')`:
      - GET /onboarding/whatsapp/start → 302 + state cookie
      - Sin sesión → 401
    - `describe('Onboarding callback')`:
      - Happy path: mock Meta API, verify Channel created + webhookSubscribed
      - State mismatch → 403
      - Code inválido (mock error) → redirect con error
      - Phone number duplicado otro merchant → 409
      - Phone number duplicado mismo merchant → update success
    - `describe('Retry webhook subscription')`:
      - POST con channelId válido → success
      - POST con channelId de otro merchant → 403
      - Sin sesión → 401

- Manual (si aplica):
  - Verificar en entorno dev/staging que el flujo completo con Meta real funciona (requiere Meta App configurada).

## DoD

- [ ] Todos los AC tienen evidencia (tests pasan, verificables).
- [ ] Sin scope creep (solo lo del brief).
- [ ] Estado persistido en Postgres: Channel extendido con campos WABA.
- [ ] Idempotencia: state cookie + UNIQUE constraint en (type, externalId).
- [ ] Guardrails: credentials nunca expuestas en frontend (exchange server-side).
- [ ] PII minimizada: access_token en credentials JSON (no en logs); TODO comentado para encriptación futura.
- [ ] `pnpm lint` y `pnpm test` pasan.
- [ ] DB: migración incluida y backwards-compatible.
- [ ] `.env.example` actualizado con variables Meta + comentarios de setup.
- [ ] README o docs incluyen instrucciones de configuración Meta App Dashboard.

## Constraints

- Guardrails: access_token nunca expuesto en logs o frontend (solo en Channel.credentials).
- PII: phone numbers se maskean en logs (excepto display en UI autorizado).
- Security: state cookie previene CSRF; SessionAuthGuard previene acceso no autorizado.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Meta API cambia estructura de response | Mock detallado en tests; validación estricta de payloads con DTOs; logging de errores inesperados |
| Webhook subscription falla silenciosamente | Log warning + Channel.webhookSubscribed=false + retry endpoint manual; PR-14 agregará health check |
| Credentials robadas de DB | TODO comentado para encriptación; por ahora DB access controlado; future PR agregará encrypt helper |
| Merchant conecta número incorrecto | UI debe mostrar verified_name + display_phone_number antes de confirmar (fuera de scope backend) |
| Race condition en callback (doble click) | Idempotencia por UNIQUE constraint en (type, externalId) + Prisma retry logic |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| - | - | - |
