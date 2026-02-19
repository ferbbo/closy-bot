# Brief — PR-FE-00 — Backend CORS: Habilitar cross-origin para dashboard

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-00-backend-cors.md`
> **Issue**: #65
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Configurar CORS en el backend NestJS para permitir requests cross-origin desde el frontend dashboard (Next.js en localhost:3001 dev, dominio de producción más adelante), habilitando cookies de sesión con `credentials: true`. Sin esta configuración, el browser bloquea los requests AJAX desde el frontend hacia el backend.

## Scope fence

### ✅ Included

- Configuración CORS en `main.ts` usando `app.enableCors()`
- Env var `CORS_ORIGINS` (comma-separated list de orígenes permitidos)
- Defaults: `http://localhost:3001` para dev
- Credentials habilitado (`true`) para cookies de sesión
- Methods permitidos: GET, POST, PATCH, PUT, DELETE, OPTIONS
- Allowed headers: Content-Type, Cookie, x-api-key, Authorization
- Exposed headers: Set-Cookie
- Actualización de `.env.example` con `CORS_ORIGINS`
- Tests E2E: verificar headers CORS en responses

### ❌ Excluded

- Rate limiting por origen
- CORS dinámico por merchant (multi-tenancy CORS)
- CSRF tokens (out of scope V1)
- CORS preflight caching avanzado
- Múltiples dominios de producción (1 solo por ahora)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Configurar CORS en `main.ts` con origen, credentials, methods, headers | #65 | AC-01, AC-02 |
| REQ-02 | Env var `CORS_ORIGINS` con parsing y defaults | #65 | AC-03 |
| REQ-03 | Actualizar `.env.example` con `CORS_ORIGINS` documentado | #65 | AC-04 |
| REQ-04 | Tests E2E: verificar headers CORS en OPTIONS/GET | #65 | AC-05, AC-06 |

> **Nota**: Todos los REQs apuntan al mismo issue (#65).

## Paths a tocar (concretos)

- `apps/api/src/main.ts` — agregar configuración CORS
- `.env.example` — agregar `CORS_ORIGINS` con documentación
- `apps/api/test/cors.e2e-spec.ts` (nuevo) — tests E2E de CORS

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

**Escenario frontend (TanStack Query desde Next.js):**

```typescript
// apps/dashboard/src/lib/api.ts
const fetchAuth = async () => {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    credentials: 'include', // ← Browser envía cookie session_id
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
};
```

**Esperado:**
- Browser hace preflight `OPTIONS /auth/me` con `Origin: http://localhost:3001`
- Backend responde:
  - `Access-Control-Allow-Origin: http://localhost:3001`
  - `Access-Control-Allow-Credentials: true`
  - `Access-Control-Allow-Headers: Content-Type, Cookie, x-api-key, Authorization`
- Browser permite request `GET /auth/me` con cookie
- Backend responde con `Set-Cookie` visible al browser (Exposed Headers)

**cURL test básico (no incluye cookie, solo headers):**
```bash
# Preflight OPTIONS
curl -X OPTIONS http://localhost:3000/auth/me \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Expected response headers:
# Access-Control-Allow-Origin: http://localhost:3001
# Access-Control-Allow-Credentials: true
# Access-Control-Allow-Methods: GET,POST,PATCH,PUT,DELETE,OPTIONS
```

### Configuración CORS (main.ts)

```typescript
// apps/api/src/main.ts
const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3001');
const allowedOrigins = corsOrigins.split(',').map(origin => origin.trim());

app.enableCors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Cookie', 'x-api-key', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
});
```

### Env vars

- `CORS_ORIGINS` (string): comma-separated list de orígenes permitidos
  - Dev default: `http://localhost:3001`
  - Producción: `https://dashboard.closybot.com` (ejemplo)
  - Multiple: `http://localhost:3001,https://dashboard.closybot.com`

## Comportamiento

### Happy path

1. **Dev mode**: `CORS_ORIGINS=http://localhost:3001` (o usar default)
2. Frontend hace request `GET /auth/me` desde `http://localhost:3001`
3. Browser hace preflight `OPTIONS /auth/me` con header `Origin: http://localhost:3001`
4. Backend responde 200 con headers CORS correctos
5. Browser permite request real con credentials
6. Backend responde con datos + `Set-Cookie` visible

### Edge cases

- **Origen no permitido**: request desde `http://evil.com` → browser bloquea (sin headers CORS en response)
- **CORS_ORIGINS vacío**: fallback a `http://localhost:3001`
- **Multiple origins**: `CORS_ORIGINS=http://localhost:3001,https://dashboard.closybot.com` → parsing correcto
- **Whitespace en env**: `http://localhost:3001 , https://dashboard.closybot.com` → trim aplicado
- **Producción sin CORS_ORIGINS**: logger warning + usa default (evita bloqueo total)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `OPTIONS /auth/me` desde origen permitido retorna headers CORS correctos | test: `cors.e2e-spec.ts` > "should return CORS headers on OPTIONS preflight" |
| AC-02 | `GET /auth/me` desde origen permitido permite credentials | test: `cors.e2e-spec.ts` > "should allow credentials on actual request" |
| AC-03 | Env var `CORS_ORIGINS` parsea múltiples orígenes correctamente | test: unit en `main.spec.ts` (si aplica) o manual log check |
| AC-04 | `.env.example` incluye `CORS_ORIGINS` con docs y ejemplo | manual: verificar archivo actualizado |
| AC-05 | Request desde origen NO permitido → browser bloquea (sin headers CORS) | test: `cors.e2e-spec.ts` > "should block request from disallowed origin" |
| AC-06 | Header `Set-Cookie` es expuesto al browser (Exposed Headers) | test: `cors.e2e-spec.ts` > "should expose Set-Cookie header" |

## Plan de pruebas

### E2E

- **cors.e2e-spec.ts** (nuevo):
  - Test 1: OPTIONS preflight desde `http://localhost:3001` → headers CORS presentes
  - Test 2: GET request con `Origin: http://localhost:3001` → header `Access-Control-Allow-Origin` presente
  - Test 3: Request desde origen no listado (`http://evil.com`) → sin headers CORS
  - Test 4: Header `Set-Cookie` incluido en `Access-Control-Expose-Headers`
  - Test 5: `Access-Control-Allow-Credentials: true` presente

### Manual

- Start backend: `pnpm dev`
- Start frontend (cuando exista): `pnpm dev:dashboard`
- Login flow: verificar que `GET /auth/me` funciona desde `localhost:3001` con cookie

## DoD

- [ ] Todos los AC tienen evidencia (tests pasando)
- [ ] Sin scope creep (solo CORS básico, sin rate limiting ni CSRF)
- [ ] Configuración CORS usa env var `CORS_ORIGINS`
- [ ] `.env.example` actualizado con documentación clara
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] Tests E2E (`cors.e2e-spec.ts`) cubren happy path + edge cases
- [ ] Logger warning si `CORS_ORIGINS` no definido (safe default usado)
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con sección CORS:
  - [ ] cURL example de preflight OPTIONS
  - [ ] Configuración de env var `CORS_ORIGINS`
  - [ ] Troubleshooting común (origen bloqueado, credentials)

## Constraints

- Guardrails: N/A (CORS es configuración de infraestructura).
- PII: N/A.
- Security: orígenes deben ser explícitos (no usar `*` con credentials, NestJS lo bloquea).

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Olvidar agregar dominio de producción a `CORS_ORIGINS` | Media | Alto | Documentar en `.env.example` y en deployment docs |
| Browser cache agresivo de preflight OPTIONS | Baja | Bajo | No optimizar caching en MVP (default 5 seconds está bien) |
| Credential + wildcard origin error | Baja | Alto | NestJS valida automáticamente, test para confirmar |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
