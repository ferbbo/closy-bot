# Brief — PR-12 — Auth Social OIDC: Google + Microsoft con sesión PostgreSQL

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-12-auth-oidc-session.md`
> **Regla**: Máx 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Implementar autenticación OIDC (OpenID Connect Authorization Code Flow) para Merchants con sesión server-side en PostgreSQL, habilitando acceso seguro al dashboard/admin (RNF-08). Soporte inicial para Google y Microsoft como identity providers, con arquitectura extensible.

## Scope fence

### ✅ Included

- Modelos `MerchantIdentity` + `Session` (Prisma) con relaciones a `Merchant`.
- Interface abstracta `OidcProvider` + implementaciones `GoogleOidcProvider` y `MicrosoftOidcProvider`.
- `SessionService` con CRUD de sesiones y cleanup de expiradas.
- `PostgresSessionStore` (implementación de interface `SessionStore`, migrable a Redis).
- `AuthService` para orquestación: login flow, exchange code, validar ID token, linkear merchant.
- Endpoints: `GET /auth/login/:provider`, `GET /auth/callback/:provider`, `GET /auth/me`, `POST /auth/logout`.
- `SessionAuthGuard` para proteger endpoints que requieren autenticación.
- Cookie session: `HttpOnly`, `Secure` (en prod), `SameSite=Lax`.
- State parameter con cookie temporal para CSRF protection.
- Session cleanup job (`@nestjs/schedule`) para eliminar sesiones expiradas.
- Merchant linking: primera vez busca/crea merchant por email; subsecuentes lookup por `(provider, oidcSubject)`.
- Tests unit + e2e (login redirect, callback, me, logout, session expiry).
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `AUTH_SESSION_TTL_HOURS`, `AUTH_REDIRECT_URL`, `AUTH_COOKIE_DOMAIN` (optional).
- Actualización de `.env.example` con nuevas variables.

### ❌ Excluded

- UI/Frontend (solo backend API).
- JWT tokens (no usar JWT, solo session ID en cookie).
- Refresh tokens o acceso a APIs de Google/Microsoft (solo identity).
- Logout global del provider (solo logout local de sesión).
- Sistema de roles/permisos (1 cuenta OIDC = 1 merchant, sin roles por ahora).
- Rate limiting (puede agregarse después).
- Encryption de credentials en DB (TODO para futuro).
- Redis como session store (diseño permite swap, pero V1 usa Postgres).
- **PKCE (Proof Key for Code Exchange):** V1 usa state + client_secret (suficiente para backend confidencial); PKCE se agregará en V2 como best practice OAuth 2.1.

## Requisitos numerados

| ID     | Requisito                                                                                          | Issue | AC                    |
|--------|---------------------------------------------------------------------------------------------------|-------|-----------------------|
| REQ-01 | Crear modelos `MerchantIdentity` + `Session` con relación a `Merchant`                           | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-01                 |
| REQ-02 | Implementar interface `OidcProvider` + `GoogleOidcProvider`                                       | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-02, AC-03          |
| REQ-03 | Implementar `MicrosoftOidcProvider`                                                               | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-04, AC-05          |
| REQ-04 | Implementar `SessionService` + `PostgresSessionStore`                                             | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-06, AC-07          |
| REQ-05 | Implementar `AuthService` (orchestration: login, callback, merchant linking)                      | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-08, AC-09          |
| REQ-06 | Endpoints: `/auth/login/:provider`, `/auth/callback/:provider`, `/auth/me`, `/auth/logout`       | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-10, AC-11, AC-12   |
| REQ-07 | Implementar `SessionAuthGuard` para endpoints protegidos                                          | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-13                 |
| REQ-08 | Session cleanup job con `@nestjs/schedule`                                                        | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-14                 |
| REQ-09 | Tests unit + e2e (login, callback, me, logout, session expiry, unknown provider)                 | [#38](https://github.com/ferbbo/closy-bot/issues/38)  | AC-15, AC-16, AC-17   |

## Paths a tocar (concretos)

- `prisma/schema.prisma`
- `prisma/migrations/*` (nueva migración)
- `apps/api/src/auth/` (nuevo módulo)
  - `auth.module.ts`
  - `auth.controller.ts`
  - `auth.service.ts`
  - `auth.service.spec.ts`
  - `session/session.service.ts`
  - `session/session.service.spec.ts`
  - `session/session-store.interface.ts`
  - `session/postgres-session.store.ts`
  - `session/postgres-session.store.spec.ts`
  - `providers/oidc-provider.interface.ts`
  - `providers/google-oidc.provider.ts`
  - `providers/google-oidc.provider.spec.ts`
  - `providers/microsoft-oidc.provider.ts`
  - `providers/microsoft-oidc.provider.spec.ts`
  - `guards/session-auth.guard.ts`
  - `guards/session-auth.guard.spec.ts`
  - `dto/auth-me.response.dto.ts`
- `apps/api/src/app.module.ts` (importar AuthModule)
- `apps/api/src/common/config/env.validation.ts` (agregar validaciones OIDC config)
- `test/auth.e2e-spec.ts` (nuevo e2e test)
- `.env.example`

## Contratos / Interfaces

- Persistencia (Prisma/models):
  ```prisma
  enum OidcProvider {
    GOOGLE
    MICROSOFT
  }

  model MerchantIdentity {
    id          String       @id @default(cuid())
    merchantId  String       @map("merchant_id")
    provider    OidcProvider
    oidcSubject String       @map("oidc_subject") // 'sub' claim del ID token
    email       String
    createdAt   DateTime     @default(now()) @map("created_at")

    merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)

    @@unique([provider, oidcSubject])
    @@map("merchant_identities")
    @@index([merchantId])
  }

  model Session {
    id        String    @id @default(cuid())
    sessionId String    @unique @map("session_id") // UUID para cookie
    merchantId String   @map("merchant_id")
    expiresAt DateTime  @map("expires_at")
    userAgent String?   @map("user_agent")
    ipAddress String?   @map("ip_address")
    createdAt DateTime  @default(now()) @map("created_at")

    merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)

    @@map("sessions")
    @@index([sessionId])
    @@index([expiresAt])
    @@index([merchantId])
  }

  // En Merchant:
  identities MerchantIdentity[]
  sessions   Session[]
  ```

- OidcProvider interface:
  ```typescript
  interface OidcTokens {
    idToken: string;
    accessToken?: string;
  }

  interface OidcUserInfo {
    sub: string;        // OIDC subject (unique ID)
    email: string;
    name?: string;
  }

  interface OidcProvider {
    getAuthorizationUrl(state: string, redirectUri: string): string;
    exchangeCodeForTokens(code: string, redirectUri: string): Promise<OidcTokens>;
    getUserInfo(idToken: string): Promise<OidcUserInfo>;
  }
  ```

- SessionStore interface:
  ```typescript
  interface SessionStore {
    create(merchantId: string, ttlHours: number, metadata?: { userAgent?: string; ipAddress?: string }): Promise<Session>;
    findBySessionId(sessionId: string): Promise<Session | null>;
    deleteBySessionId(sessionId: string): Promise<void>;
    deleteExpired(): Promise<number>;
  }
  ```

- AuthService:
  ```typescript
  startLogin(provider: 'google' | 'microsoft'): { redirectUrl: string; stateCookie: string };
  handleCallback(provider: 'google' | 'microsoft', code: string, state: string): Promise<{ sessionId: string; merchant: Merchant }>;
  validateSession(sessionId: string): Promise<Merchant | null>;
  logout(sessionId: string): Promise<void>;
  ```

- Endpoints:
  - `GET /auth/login/:provider` → 302 redirect a provider + Set-Cookie state
  - `GET /auth/callback/:provider?code=X&state=Y` → exchange, link merchant, create session, Set-Cookie session_id + 302 /dashboard
  - `GET /auth/me` → `{ merchant: { id, name, email }, authenticated: true }` o 401
  - `POST /auth/logout` → delete session + clear cookie + 200

- Idempotencia:
  - State cookie previene CSRF (cada login genera state único, validado en callback).
  - Session ID único (UUID v4).
  - Multiple login del mismo merchant: reemplaza sesión anterior (o crea nueva, según diseño).
  - Logout es idempotente (delete session no falla si no existe).

## Comportamiento

- Happy path (Google):
  1. Browser → `GET /auth/login/google`
  2. Backend genera state UUID, setea cookie `oidc_state` (HttpOnly, 5min TTL)
  3. Backend retorna 302 redirect a Google authorization URL con state
  4. Usuario se autentica en Google
  5. Google redirect → `GET /auth/callback/google?code=X&state=Y`
  6. Backend valida state contra cookie
  7. Backend exchange code por tokens (POST a Google token endpoint)
  8. Backend valida ID token (signature, expiry, audience)
  9. Backend extrae `sub` + `email` del ID token
  10. Backend busca `MerchantIdentity` por `(GOOGLE, sub)`:
      - Si existe → obtiene merchant
      - Si no existe → busca merchant por email o crea nuevo merchant + MerchantIdentity
  11. Backend crea `Session` (24h TTL por defecto)
  12. Backend setea cookie `session_id` (HttpOnly, Secure, SameSite=Lax)
  13. Backend retorna 302 redirect a `/dashboard` (o URL configurada)

- Happy path (Microsoft):
  - Igual que Google, pero usando Microsoft Entra ID (Azure AD) endpoints.

- `/auth/me`:
  - Cookie `session_id` presente → lookup session → si válida (no expirada) → retorna merchant
  - Cookie ausente o session expirada → 401 Unauthorized

- `/auth/logout`:
  - Cookie `session_id` presente → delete session en DB + clear cookie
  - Retorna 200 OK

- Edge cases:
  - **State mismatch** (CSRF attempt): callback rechaza con 403 Forbidden.
  - **Invalid code**: exchange falla → callback retorna 400 Bad Request con error message.
  - **Session expirada**: `/auth/me` retorna 401, frontend redirige a login.
  - **Provider desconocido**: `/auth/login/unknown` retorna 404 Not Found.
  - **Merchant no existe y no se puede crear**: callback retorna 500 (o crea merchant con datos mínimos).
  - **Cleanup job**: cron elimina sessions con `expiresAt < now()` (no afecta usuarios activos).

## Acceptance Criteria (verificables)

| ID     | Criterio                                                                                     | Evidencia                                                      |
|--------|----------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| AC-01  | Migración crea tablas `merchant_identities` + `sessions` con índices y relaciones           | Migration file exists + `pnpm db:migrate` success              |
| AC-02  | `GoogleOidcProvider.getAuthorizationUrl()` genera URL válida con state y redirect_uri       | Unit test: `google-oidc.provider.spec.ts`                      |
| AC-03  | `GoogleOidcProvider.exchangeCodeForTokens()` llama token endpoint y retorna tokens          | Unit test con mock HTTP client                                 |
| AC-04  | `MicrosoftOidcProvider.getAuthorizationUrl()` genera URL válida                             | Unit test: `microsoft-oidc.provider.spec.ts`                   |
| AC-05  | `MicrosoftOidcProvider.exchangeCodeForTokens()` funciona correctamente                      | Unit test con mock HTTP client                                 |
| AC-06  | `SessionService.create()` persiste sesión en Postgres y retorna session ID                  | Unit test: `session.service.spec.ts`                           |
| AC-07  | `SessionService.validate()` retorna merchant si session válida, null si expirada            | Unit test con fecha mock (past expiry)                         |
| AC-08  | `AuthService.startLogin()` genera state, setea cookie, retorna redirect URL                 | Unit test: `auth.service.spec.ts`                              |
| AC-09  | `AuthService.handleCallback()` valida state, exchange code, linkea merchant, crea sesión    | Unit test con providers mock                                   |
| AC-10  | `GET /auth/login/google` retorna 302 con Location header y state cookie                     | E2E: `auth.e2e-spec.ts → login redirect test`                  |
| AC-11  | `GET /auth/callback/google?code=X&state=Y` crea sesión y setea cookie (mock provider)       | E2E: `auth.e2e-spec.ts → callback success test`                |
| AC-12  | `GET /auth/me` con cookie válida retorna merchant info; sin cookie retorna 401              | E2E: `auth.e2e-spec.ts → me endpoint test`                     |
| AC-13  | `SessionAuthGuard` rechaza request sin cookie o con session expirada                        | Unit test: `session-auth.guard.spec.ts`                        |
| AC-14  | Session cleanup job elimina sesiones expiradas periódicamente                               | Unit test: mock time + verify deleteExpired() called           |
| AC-15  | `POST /auth/logout` invalida sesión y clear cookie                                          | E2E: `auth.e2e-spec.ts → logout test`                          |
| AC-16  | State mismatch en callback retorna 403                                                      | E2E: `auth.e2e-spec.ts → CSRF protection test`                 |
| AC-17  | Provider desconocido en `/auth/login/:provider` retorna 404                                 | E2E: `auth.e2e-spec.ts → unknown provider test`                |

## Plan de pruebas

- Unit:
  - `GoogleOidcProvider`: mock axios, validar URL generation, token exchange, user info extraction.
  - `MicrosoftOidcProvider`: idem.
  - `SessionService`: mock Prisma, validar CRUD operations, expiry logic.
  - `AuthService`: mock providers + session service, validar orquestación completa.
  - `SessionAuthGuard`: mock request/response, validar validación de cookie.

- Integration/E2E:
  - Login flow: mock OIDC provider (stub endpoints), verificar redirect + state cookie.
  - Callback flow: mock token exchange success, verificar session creation + cookie set.
  - Me endpoint: crear session en DB, hacer request con cookie, verificar response 200 con merchant data.
  - Me endpoint sin cookie: verificar 401.
  - Logout: crear session, hacer logout, verificar session deleted + cookie cleared.
  - CSRF protection: callback con state incorrecto retorna 403.
  - Unknown provider: retorna 404.

- Manual (si aplica):
  - Configurar Google OAuth app en Google Cloud Console.
  - Configurar Microsoft app en Azure AD.
  - Probar login end-to-end con browser (fuera de scope de este PR, pero útil para validación humana).

## DoD

- [ ] Todos los AC tienen evidencia (test names documentados)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (sesiones en DB, no memoria)
- [ ] Idempotencia implementada (state cookie CSRF, session ID único)
- [ ] Guardrails: N/A (no aplica LLM en este PR)
- [ ] PII minimizada: email en `MerchantIdentity`, pero NO se loggea en texto plano; IP/user agent opcionales
- [ ] Secrets en env vars (nunca hardcodeados): `CLIENT_ID`, `CLIENT_SECRET`
- [ ] Cookie security: HttpOnly, Secure (en prod), SameSite=Lax
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migration incluida para `merchant_identities` + `sessions`
- [ ] `.env.example` actualizado con nuevas variables

## Constraints

- **Security-first:**
  - State parameter obligatorio para CSRF protection.
  - ID token signature validation obligatoria.
  - Cookie HttpOnly previene XSS.
  - Cookie Secure previene MITM (solo en prod, dev puede ser HTTP).
- **No guardar access tokens**: solo identity (sub + email), no acceso a APIs de Google/MS.
- **Session store pattern**: interface permite swap a Redis sin cambiar AuthService/guard.
- **1 cuenta OIDC = 1 merchant**: no hay sistema de roles por ahora, merchant se vincula directamente.

## Riesgos y mitigaciones

| Riesgo                                      | Impacto | Mitigación                                                                 |
|---------------------------------------------|---------|---------------------------------------------------------------------------|
| ID token inválido (firma, expiry)          | Alto    | Validar signature usando JWKS endpoint del provider + check expiry        |
| CSRF attack vía callback sin state          | Alto    | State parameter obligatorio + validación contra cookie                    |
| Session hijacking                           | Medio   | **V1:** HttpOnly + Secure cookies. **Futuro:** IP whitelist en Session model (`ipAddress` + validación en guard: rechazar si IP cambió); agregar campo `lastSeenIp` para detectar cambios sospechosos; considerar re-auth challenge si IP cambia de país/región |
| Merchant duplicado por email                | Bajo    | Unique constraint en email (si se agrega) o lookup first + create atomic  |
| Callback failure (network, provider down)   | Medio   | Error handling + user-friendly message + retry guidance                   |
| Session store Postgres performance          | Bajo    | **V1:** Index en sessionId + cleanup job periódico. **Migración a Redis:** (1) SessionStore interface ya permite swap sin breaking changes, (2) Implementar `RedisSessionStore` con mismo contrato, (3) Toggle via feature flag `SESSION_STORE_TYPE=redis|postgres`, (4) Scripts de migración de sesiones existentes (opcional, o dejar expirar naturalmente). Redis reduce latencia de lookup y facilita invalidación global |
| Cleanup job elimina sesiones activas        | Bajo    | TTL bien configurado (default 24h) + user puede re-login                  |

### Notas técnicas: Migración futura a Redis

El diseño de `SessionStore` interface permite migración no-disruptiva:

```typescript
// V1: PostgresSessionStore (actual)
interface SessionStore {
  create(...): Promise<Session>;
  findBySessionId(sessionId: string): Promise<Session | null>;
  deleteBySessionId(sessionId: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

// Futuro: RedisSessionStore
class RedisSessionStore implements SessionStore {
  // Key pattern: session:{sessionId}
  // TTL automático en Redis (no necesita cleanup job)
  // Atomic operations: SET EX, GET, DEL
}

// En AuthModule:
providers: [
  {
    provide: 'SessionStore',
    useClass: process.env.SESSION_STORE_TYPE === 'redis' 
      ? RedisSessionStore 
      : PostgresSessionStore
  }
]
```

**Cuándo migrar a Redis:**
- Más de 10k sesiones concurrentes (Postgres empieza a mostrar latencia en lookups)
- Necesidad de invalidación global (ej. logout de todos los devices)
- Multi-region deployment (Redis cluster con replicación)

### Enhancement futuro: PKCE (OAuth 2.1 best practice)

**V1:** State + client_secret es suficiente para backend confidencial.

**Futuro (V2):** Agregar PKCE para alinearse con OAuth 2.1 recommendations:

```typescript
// En startLogin():
const codeVerifier = generateRandomString(128); // A-Z, a-z, 0-9, -, ., _, ~
const codeChallenge = base64url(sha256(codeVerifier));
// Guardar codeVerifier en cookie temporal
// Agregar a authorization URL: &code_challenge=...&code_challenge_method=S256

// En handleCallback():
// Recuperar codeVerifier de cookie
// Enviar en token exchange: { code, code_verifier, client_id, client_secret }
```

**Beneficio:** Protección extra contra code interception (aunque edge case muy raro con HTTPS + state + client_secret).

## Config (Env vars)

```bash
# Google OIDC
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# Microsoft OIDC (Azure AD)
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Auth config
AUTH_SESSION_TTL_HOURS=24
AUTH_REDIRECT_URL=http://localhost:3000  # Base URL for callbacks
AUTH_COOKIE_DOMAIN=localhost             # Optional, auto-detect if not set

# Session cleanup job
AUTH_SESSION_CLEANUP_CRON="0 */6 * * *"  # Every 6 hours (optional)
```

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| -     | -      | -      |
