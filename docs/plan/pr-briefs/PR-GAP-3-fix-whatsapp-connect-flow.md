# Brief — PR-GAP-3 — Fix Add WhatsApp Flow: URL alignment + callback redirect + popup communication

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-GAP-3-fix-whatsapp-connect-flow.md`
> **Issue**: [#114](https://github.com/ferbbo/closy-bot/issues/114)
> **Parallel Mode**: `false`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Completar el flujo end-to-end de "Conectar WhatsApp" desde el wizard de onboarding y la Channels UI. Actualmente hay 3 gaps críticos que impiden el flujo funcional: (1) URL mismatch frontend→backend, (2) callback redirige a página en vez de cerrar popup, (3) sin comunicación popup→parent window.

## Scope fence

### ✅ Included

- Cambiar `signupUrl` en `step-channel.tsx` de `/channels/meta/embedded-signup` a `/onboarding/whatsapp/start`
- Agregar listener `window.addEventListener('message', ...)` en `step-channel.tsx` para recibir resultado del popup
- Agregar listener similar en `channels/page.tsx` (botón "Conectar WhatsApp" desde empty state)
- Reemplazar `res.redirect()` en `meta-oauth.controller.ts` callback por HTML inline que ejecuta `window.opener.postMessage()` y `window.close()`
- Agregar nueva env var `DASHBOARD_URL` para `targetOrigin` seguro en `postMessage`
- Actualizar `env.validation.ts`: agregar `DASHBOARD_URL: Joi.string().uri().required()`
- Actualizar `.env.example`: agregar `DASHBOARD_URL=http://localhost:3001`
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con flujo completo documentado
- Tests unitarios + e2e básicos (happy path + error path)

### ❌ Excluded

- Token refresh automático
- Multi-channel CRUD UI
- Instagram channel
- Retry UI avanzado (polling infinito, multiple attempts tracking)
- Cambios en Prisma schema o migraciones

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Frontend: Corregir URL popup de `/channels/meta/embedded-signup` a `/onboarding/whatsapp/start` | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-01 |
| REQ-02 | Frontend: Implementar listener `window.addEventListener('message')` en step-channel.tsx para recibir result del popup | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-02 |
| REQ-03 | Frontend: Auto-invalidar query onboarding progress y avanzar step al recibir `{ type: 'whatsapp-connected' }` | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-03 |
| REQ-04 | Frontend: Timeout/fallback si popup cerrado sin mensaje → mostrar "Intenta de nuevo" | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-04 |
| REQ-05 | Frontend: Mismo patrón listener en `channels/page.tsx` (botón "Conectar WhatsApp" desde empty state) | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-05 |
| REQ-06 | Backend: Reemplazar `res.redirect()` en callback por HTML inline con `window.opener.postMessage()` + `window.close()` | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-06 |
| REQ-07 | Backend: Error path ejecuta HTML que comunica `{ type: 'whatsapp-error', reason }` al parent y cierra | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-07 |
| REQ-08 | Backend: Agregar env var `DASHBOARD_URL` y usarla como `targetOrigin` en `postMessage` (nunca `*`) | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-08 |
| REQ-09 | Backend: Actualizar `env.validation.ts` con `DASHBOARD_URL: Joi.string().uri().required()` | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-09 |
| REQ-10 | Actualizar `.env.example` con `DASHBOARD_URL=http://localhost:3001` | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-10 |
| REQ-11 | Actualizar `BACKEND-EXECUTION-GUIDE.md` con flujo completo y cURL equivalents (NA para popup flow, pero documentar secuencia) | [#114](https://github.com/ferbbo/closy-bot/issues/114) | AC-11 |

> **Nota**: Todos los REQs apuntan al mismo issue ([#114](https://github.com/ferbbo/closy-bot/issues/114)).

## Paths a tocar (concretos)

### Frontend (apps/dashboard):
- `src/app/onboarding/_components/step-channel.tsx` (línea 26: cambiar URL, agregar listener)
- `src/app/dashboard/channels/components/empty-channels-state.tsx` (agregar handler + listener similar)
- `src/app/dashboard/channels/page.tsx` (si tiene botón "Conectar otro canal", agregar listener)

### Backend (apps/api):
- `src/onboarding/meta-oauth.controller.ts` (línea 112: reemplazar redirect por HTML inline)
- `src/common/config/env.validation.ts` (agregar `DASHBOARD_URL`)

### Config/Docs:
- `.env.example` (agregar `DASHBOARD_URL`)
- `docs/BACKEND-EXECUTION-GUIDE.md` (documentar flujo popup completo)

## Contratos / Interfaces

### Frontend → Backend (popup flow)

No hay llamada HTTP directa del frontend al backend en este flujo. El popup abre `/onboarding/whatsapp/start` (backend redirige a Meta OAuth), Meta redirige de vuelta a `/onboarding/whatsapp/callback` (backend).

### Backend → Frontend (postMessage)

**Success:**
```typescript
window.opener.postMessage(
  {
    type: 'whatsapp-connected',
    channelId: string,
    timestamp: number
  },
  DASHBOARD_URL // targetOrigin from env
);
```

**Error:**
```typescript
window.opener.postMessage(
  {
    type: 'whatsapp-error',
    reason: 'invalid_code' | 'waba_fetch_failed' | 'unknown_error',
    message?: string, // optional user-friendly message
    timestamp: number
  },
  DASHBOARD_URL
);
```

### Frontend listener (step-channel.tsx y channels/page.tsx)

```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    // Validate origin
    if (event.origin !== process.env.NEXT_PUBLIC_API_URL) {
      return;
    }

    const data = event.data;

    if (data.type === 'whatsapp-connected') {
      // Invalidate onboarding progress query
      // Auto-advance to next step or show success
      setWaitingConnection(false);
    } else if (data.type === 'whatsapp-error') {
      // Show error alert with reason
      setWaitingConnection(false);
      setErrorReason(data.reason);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

### Backend HTML template (inline en callback)

```typescript
const successHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Conectando WhatsApp...</title>
</head>
<body>
  <p>Conectando WhatsApp...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'whatsapp-connected',
          channelId: '${channelId}',
          timestamp: Date.now()
        },
        '${dashboardUrl}'
      );
      setTimeout(() => window.close(), 500);
    } else {
      document.body.innerHTML = '<p>✅ WhatsApp conectado. Vuelve al dashboard y refresca la página.</p>';
    }
  </script>
</body>
</html>
`;

res.setHeader('Content-Type', 'text/html');
res.send(successHtml);
```

### Env vars

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `DASHBOARD_URL` | string (URI) | Yes | — | URL base del dashboard frontend (ej: `http://localhost:3001`). Usado como `targetOrigin` en `postMessage` para seguridad. |

## Comportamiento

### Happy path

1. Merchant en wizard step-channel (o Channels page) hace clic en "Conectar WhatsApp"
2. Frontend abre popup a `${NEXT_PUBLIC_API_URL}/onboarding/whatsapp/start`
3. Backend (controller start) redirige a Meta OAuth con state cookie
4. Merchant autoriza en Meta
5. Meta redirige de vuelta a `${NEXT_PUBLIC_API_URL}/onboarding/whatsapp/callback?code=...&state=...`
6. Backend valida state, exchange code → accessToken, crea Channel
7. Backend responde con HTML inline que ejecuta `window.opener.postMessage({ type: 'whatsapp-connected', channelId })` hacia `DASHBOARD_URL`
8. Popup se cierra automáticamente (`window.close()`)
9. Frontend listener recibe mensaje, invalida query, actualiza UI ("✅ WhatsApp conectado"), auto-avanza step si está en wizard
10. Merchant continua sin reload manual

### Error path (backend error durante exchange/create)

1. Pasos 1-5 iguales
2. Backend detecta error (invalid code, WABA fetch failed, etc.)
3. Backend responde con HTML inline que ejecuta `window.opener.postMessage({ type: 'whatsapp-error', reason: 'invalid_code' })`
4. Popup se cierra
5. Frontend listener recibe mensaje, muestra Alert con mensaje actionable ("Hubo un problema al conectar WhatsApp. Intenta de nuevo.")
6. Merchant puede reintentar haciendo clic en botón nuevamente

### Edge case: Popup cerrado manualmente (sin mensaje)

1. Pasos 1-4 iguales
2. Merchant cierra popup manualmente antes de completar OAuth
3. Frontend listener NO recibe mensaje `whatsapp-connected` ni `whatsapp-error`
4. Frontend timeout (2 segundos después de detectar que popup cerró) → mostrar info message "No completaste la conexión. Haz clic de nuevo si deseas reintentar."
5. Estado `waitingConnection` vuelve a `false`, botón cambia a "Conectar WhatsApp" nuevamente

### Edge case: `window.opener` es null (popup reabierto manualmente)

1. Si el popup fue reabierto desde historial o el parent cerró
2. Backend ejecuta `if (window.opener)` guard → `false`
3. Backend fallback: muestra HTML estático "✅ WhatsApp conectado. Vuelve al dashboard y refresca la página."
4. Merchant ve instrucciones y puede cerrar popup manualmente, refreshear dashboard

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Popup abre `/onboarding/whatsapp/start` (no `/channels/meta/embedded-signup`) | Captura de pantalla o test e2e: popup.location.href contiene `/onboarding/whatsapp/start` |
| AC-02 | Frontend listener registrado via `window.addEventListener('message')` | Inspección código: step-channel.tsx líneas 45-65 (aprox) con `handleMessage` function |
| AC-03 | Al recibir `{ type: 'whatsapp-connected' }`, frontend invalida query y UI muestra "✅ WhatsApp conectado" | Test e2e: simular postMessage → verify UI actualizado |
| AC-04 | Si popup cerrado sin mensaje, UI muestra "Intenta de nuevo" después de timeout | Test unitario: simular popup close event → verify fallback message |
| AC-05 | Channels page empty state botón "Conectar WhatsApp" abre popup y tiene mismo listener | Test e2e: desde `/dashboard/channels` → click botón → verify popup abre y listener funciona |
| AC-06 | Backend callback responde HTML inline (no redirect), ejecuta `window.opener.postMessage()` y cierra popup | Test unitario controller: mock request → verify response es HTML con `postMessage` script |
| AC-07 | Backend error path ejecuta HTML con `{ type: 'whatsapp-error', reason }` | Test unitario: mock error en oauthService → verify HTML contiene `whatsapp-error` |
| AC-08 | `postMessage` usa `DASHBOARD_URL` como targetOrigin (nunca `*`) | Code review: verify `targetOrigin` es `process.env.DASHBOARD_URL` |
| AC-09 | `env.validation.ts` declara `DASHBOARD_URL: Joi.string().uri().required()` | Inspección código: línea ~75 de env.validation.ts |
| AC-10 | `.env.example` contiene `DASHBOARD_URL=http://localhost:3001` | Inspección archivo: grep DASHBOARD_URL .env.example |
| AC-11 | `BACKEND-EXECUTION-GUIDE.md` documenta flujo completo popup con mermaid diagram o secuencia paso a paso | Code review: verificar sección "WhatsApp Onboarding Flow" agregada |

## Plan de pruebas

### Unit tests

**Frontend (`step-channel.test.tsx`):**
- Test: `postMessage` listener se registra correctamente al montar componente
- Test: listener ignora mensajes de origin diferente (security)
- Test: listener procesa `whatsapp-connected` → actualiza estado → muestra "✅"
- Test: listener procesa `whatsapp-error` → muestra error alert con reason
- Test: timeout después de popup close sin mensaje → muestra fallback

**Backend (`meta-oauth.controller.spec.ts`):**
- Test: callback success → response HTML contiene `window.opener.postMessage` con `whatsapp-connected` y channelId correcto
- Test: callback error (invalid code) → response HTML contiene `whatsapp-error` con reason `invalid_code`
- Test: HTML usa `DASHBOARD_URL` env var (no hardcoded)
- Test: HTML incluye `window.close()` después de postMessage

### Integration tests

**E2E (playwright o similar):**
- Test: Usuario abre wizard → step channel → click "Conectar WhatsApp" → popup abre URL correcta → simular callback con mock Meta response → popup cierra → UI actualizada
- Test: Error path → popup cierra con error → UI muestra mensaje actionable
- Test: Desde Channels page empty state → click botón → mismo flujo funciona

### Manual tests

- Flujo completo local: dev server dashboard + backend → click botón → OAuth real Meta sandbox → verify popup cierra y UI se actualiza sin refresh
- Test cross-browser (Chrome, Safari, Firefox): popup funciona y postMessage recibido
- Test popup blocker: verify UI muestra mensaje "popup bloqueado" si navegador bloquea

## DoD

- [ ] Todos los AC (AC-01 a AC-11) tienen evidencia
- [ ] Sin scope creep: solo los 3 gaps identificados se arreglan
- [ ] `DASHBOARD_URL` en `.env.example` y validado en `env.validation.ts`
- [ ] `pnpm lint` pasa (frontend + backend)
- [ ] `pnpm test` pasa (todos los tests unitarios + integration)
- [ ] `npx tsc --noEmit` pasa (0 errores TypeScript)
- [ ] Flujo documentado en `BACKEND-EXECUTION-GUIDE.md` (sección "WhatsApp Onboarding Flow" con diagrama)
- [ ] Merchant puede conectar WhatsApp desde wizard y desde Channels page sin ver página rota ni redirect incorrecto
- [ ] Popup se cierra automáticamente al completar OAuth (no requiere acción manual)
- [ ] Error path muestra mensaje actionable (no jerga técnica ni stack traces)

## Constraints

- Guardrails: N/A (no involucra LLM, pricing, stock)
- PII: N/A (no maneja datos sensibles nuevos)
- Security: `postMessage` targetOrigin DEBE ser `DASHBOARD_URL` (nunca `*`)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-----------|
| Popup bloqueado por navegador | Alta | Medio | UI ya maneja caso (Alert "popup bloqueado" con instrucciones). No cambios necesarios. |
| `window.opener` null si popup reabierto | Baja | Bajo | Backend fallback: HTML estático con instrucciones para merchant. |
| Cross-origin message rejected por política CSP/CORS | Baja | Alto | `postMessage` targetOrigin es explícito (`DASHBOARD_URL`). Frontend valida `event.origin`. Testear en prod-like setup. |
| Session cookie no disponible en popup (dominio diferente) | Baja | Alto | N/A en design actual: popup abre backend (:3000), session cookie es del backend. Si frontend fuera dominio diferente, esto requeriría OAuth state handoff adicional (out of scope para GAP-3). |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
