# Guía de Ejecución Backend — Core V1 MVP

> Documentación para probar los flujos implementados desde backend (sin frontend).
> 
> **Última actualización:** 2026-02-24

---

## Requisitos Previos

### 1. Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

```bash
# Base de datos
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/closy_bot?schema=public"

# Auth OIDC (PR-12)
AUTH_REDIRECT_URL="http://localhost:3000"
AUTH_COOKIE_DOMAIN=""  # vacío para localhost
GOOGLE_CLIENT_ID="tu-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="tu-client-secret"
MICROSOFT_CLIENT_ID="tu-client-id"
MICROSOFT_CLIENT_SECRET="tu-client-secret"

# Meta WhatsApp (PR-13)
META_APP_ID="tu-app-id"
META_APP_SECRET="tu-app-secret"
META_CONFIG_ID="tu-config-id"

# WhatsApp Cloud API
# WHATSAPP_ACCESS_TOKEN="tu-access-token"
# WHATSAPP_PHONE_NUMBER_ID="tu-phone-number-id"
# WHATSAPP_WEBHOOK_VERIFY_TOKEN="tu-verify-token"
# WHATSAPP_APP_SECRET="tu-app-secret"

# LLM (opcional) - PR-03.5.1: Granular flags
# Deprecated: LLM_ENABLED=true activa todos los flags granulares (backward compat)
# LLM_ENABLED=true

# Granular LLM flags (default: false)
LLM_INTENT_ASSIST=false       # Intent assist for UNKNOWN with LLM (short prompt)
LLM_FALLBACK_ENABLED=false    # LLM fallback generation for GENERIC route
LLM_SUMMARY_ENABLED=false     # LLM conversation summaries (future)

# LLM Provider
LLM_PROVIDER="groq"
GROQ_API_KEY="tu-groq-api-key"

# Intent classification thresholds (optional)
INTENT_CONFIDENCE_THRESHOLD_HIGH=5   # Score >= 5 -> HIGH confidence
INTENT_CONFIDENCE_THRESHOLD_LOW=2    # Score >= 2 -> MED, < 2 -> LOW
```

### 2. Setup Base de Datos

```bash
# Solo postgres
docker compose up -d postgres

# Solo api (levantará postgres automáticamente por depends_on)
docker compose up -d api

# Solo dashboard (levantará api y postgres por depends_on)
docker compose up -d dashboard

## Comandos utiles
# Ver logs de un servicio específico
docker compose logs -f postgres

# Detener solo uno
docker compose stop api

# Reiniciar uno
docker compose restart dashboard

# Ver estado
docker compose ps

# Aplicar migraciones
pnpm db:migrate

# (Opcional) Seed inicial
pnpm db:seed
```

### 3. Iniciar Servidor

```bash
pnpm dev
```

El servidor estará disponible en `http://localhost:3000`.

---

## Flujo 1: Login OIDC (PR-12)

### Descripción

Autenticación de merchants via Google o Microsoft usando OIDC Authorization Code Flow con sesión server-side en PostgreSQL.

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/auth/login/:provider` | Inicia login (redirect a Google/Microsoft) |
| GET | `/auth/callback/:provider` | Callback OIDC (exchange código → sesión) |
| GET | `/auth/me` | Obtiene merchant autenticado |
| POST | `/auth/logout` | Cierra sesión |

### Probar con cURL

#### 1. Iniciar Login (manual en navegador)

```bash
# Abrir en navegador:
open "http://localhost:3000/auth/login/google"
```

Esto redirige a Google, y después del consent, callback a `/auth/callback/google`.

#### 2. Verificar Sesión

```bash
# Después del login, la cookie session_id está seteada
curl -X GET http://localhost:3000/auth/me \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json"
```

**Respuesta esperada (200):**
```json
{
  "id": "clxxx...",
  "name": "Mi Tienda",
  "email": "merchant@example.com"
}
```

**Sin sesión (401):**
```json
{
  "statusCode": 401,
  "message": "No session cookie"
}
```
# Después del login, la cookie session_id está seteada
curl -X GET http://localhost:3000/auth/me \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json"
#### 3. Logout

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Cookie: session_id=<tu-session-id>"
```

---

## Flujo 2: Agregar WhatsApp Channel (PR-13)

### Descripción

Permite a un merchant autenticado conectar su WhatsApp Business Account via Meta Embedded Signup.

### Pre-requisitos

1. Merchant autenticado (cookie `session_id` válida)
2. Meta App configurada con Embedded Signup
3. Variables `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/onboarding/whatsapp/start` | Inicia OAuth Meta (redirect) |
| GET | `/onboarding/whatsapp/callback` | Callback OAuth → crea Channel |
| POST | `/onboarding/whatsapp/:channelId/subscribe-webhook` | Retry webhook subscription |
| GET | `/channels` | **Lista todos los channels del merchant** |
| GET | `/channels/:id/health` | Health check del canal |
| POST | `/channels/:id/retry-webhook` | Retry webhook con backoff |
| POST | `/channels/:id/refresh-status` | Re-fetch status desde Meta |

### Probar con cURL

#### 1. Iniciar Onboarding (manual en navegador)

```bash
# Requiere cookie de sesión activa
open "http://localhost:3000/onboarding/whatsapp/start"
```

Meta mostrará el flujo de Embedded Signup. Al completar, callback crea el Channel.

#### 2. Listar Channels del Merchant (PR-16)

```bash
curl -X GET http://localhost:3000/channels \
  -H "Cookie: session_id=<tu-session-id>"
```

**Respuesta esperada:**
```json
[
  {
    "id": "clxxx...",
    "type": "WHATSAPP",
    "displayName": "Sucursal Centro",
    "status": "connected",
    "webhookSubscribed": true,
    "lastWebhookAt": "2026-02-19T10:30:00Z",
    "createdAt": "2026-02-15T08:00:00Z"
  },
  {
    "id": "clyyy...",
    "type": "WHATSAPP",
    "displayName": "Sucursal Norte",
    "status": "error",
    "webhookSubscribed": false,
    "lastWebhookAt": null,
    "createdAt": "2026-02-18T14:00:00Z"
  }
]
```

Si el merchant no tiene channels, retorna `[]` (array vacío).

#### 3. Health Check de Canal

```bash
curl -X GET http://localhost:3000/channels/<channel-id>/health \
  -H "Cookie: session_id=<tu-session-id>"
```

**Respuesta esperada:**
```json
{
  "channelId": "clxxx...",
  "status": "connected",
  "webhookSubscribed": true,
  "lastWebhookAt": "2026-02-19T10:30:00Z",
  "errorCount": 0,
  "recommendation": null
}
```

#### 4. Retry Webhook (si falla subscription)

```bash
curl -X POST http://localhost:3000/channels/<channel-id>/retry-webhook \
  -H "Cookie: session_id=<tu-session-id>"
```

---

### Flujo Popup end-to-end (GAP-3 — Conectar WhatsApp desde Dashboard)

> **Nota:** Este flujo no tiene cURL equivalente directo (es un popup browser ↔ parent window). Se documenta la secuencia completa para implementadores y QAs.

#### Descripción del flujo (Happy path)

```
Frontend (popup) ──[GET /onboarding/whatsapp/start]──▶ Backend
Backend ──[302 redirect]──▶ Meta OAuth (https://facebook.com/dialog/oauth)
Merchant autoriza en Meta
Meta ──[GET /onboarding/whatsapp/callback?code=...&state=...]──▶ Backend
Backend:
  1. Valida state cookie (CSRF)
  2. Exchange code → accessToken
  3. Crea Channel en DB
  4. Responde HTML inline con script:
     window.opener.postMessage(
       { type: 'whatsapp-connected', channelId, timestamp },
       DASHBOARD_URL    ← nunca '*', siempre env var
     )
     window.close()   ← popup se cierra automáticamente
Frontend recibe mensaje type='whatsapp-connected':
  - Invalida query ['onboarding','progress']
  - Invalida query ['channels']
  - Muestra "✅ WhatsApp conectado"
  - Auto-avanza al siguiente step (si está en wizard)
```

#### Diagrama de secuencia

```
Dashboard         Popup               Backend            Meta OAuth
   |                |                    |                    |
   |──open popup──▶|                    |                    |
   |  /onboard/     |──GET /start──────▶|                    |
   |  whatsapp/start|                    |──302──────────────▶|
   |                |◀───────────────────────────────(redirect)
   |                |   (merchant autoriza en Meta)          |
   |                |◀──GET /callback?code&state─────────────|
   |                |──GET /callback──▶ |                    |
   |                |                    |─[valida state]─   |
   |                |                    |─[exchange code]─  |
   |                |                    |─[crea Channel]─   |
   |                |◀──────HTML inline──|                    |
   |◀─postMessage───|  window.opener.postMessage(...)         |
   |  {type:'whatsapp-connected', channelId}                  |
   |                |──window.close()    |                    |
[invalidate queries]
[actualiza UI ✅]
```

#### Error path

```
Backend detecta error (código inválido, WABA fetch fallido, etc.)
Backend responde HTML inline con:
  window.opener.postMessage(
    { type: 'whatsapp-error', reason: 'invalid_code' | 'waba_fetch_failed' | 'unknown_error', timestamp },
    DASHBOARD_URL
  )
  window.close()
Frontend muestra Alert accionable con reason.
```

#### Edge cases

| Caso | Comportamiento |
|------|---------------|
| `window.opener === null` (popup reabierto del historial) | Backend muestra HTML estático: "WhatsApp conectado. Vuelve al dashboard." |
| Popup cerrado manualmente sin completar OAuth | Frontend detecta `popup.closed` con poll de 500ms → timeout 2s → muestra "No completaste la conexión." |
| Popup bloqueado por navegador | Frontend detecta `window.open()` retorna `null` → muestra Alert con instrucciones para permitir popups |

#### Variables de entorno requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DASHBOARD_URL` | URL base del dashboard. Usado como `targetOrigin` en `postMessage`. **Nunca usar `*`** | `http://localhost:3001` |

#### Seguridad: postMessage origin validation

**Backend (envía mensaje):**
```typescript
// En meta-oauth.controller.ts
const dashboardUrl = this.configService.get<string>('DASHBOARD_URL', 'http://localhost:3001');
window.opener.postMessage({ ... }, dashboardUrl); // targetOrigin explícito
```

**Frontend (recibe mensaje):**
```typescript
// En step-channel.tsx y empty-channels-state.tsx
const expectedOrigin = new URL(process.env.NEXT_PUBLIC_API_URL!).origin;
const handleMessage = (event: MessageEvent) => {
  if (event.origin !== expectedOrigin) return; // Rechaza mensajes de otros orígenes
  // procesar event.data
};
```

---

## Flujo 3: Conversación con Bot (PR-03.5 + PR-03.6)


### Descripción

Flujo conversacional WhatsApp para:
- Saludo y ayuda
- Búsqueda de productos
- Respuestas con LLM (si `LLM_ENABLED=true`)

### Pre-requisitos

1. Channel creado y conectado
2. Productos cargados en catálogo
3. Webhook configurado en Meta para recibir mensajes

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/webhooks/whatsapp` | Verificación Meta webhook |
| POST | `/webhooks/whatsapp` | Procesa mensajes inbound |
| POST | `/api/catalog/import` | Import CSV (JSON body) |
| GET | `/api/products` | Lista productos |
| GET | `/api/products?q=<texto>` | Buscar productos |

### Probar Webhook Verification

```bash
curl "http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=tu-verify-token&hub.challenge=test123"
```

**Respuesta esperada:** `test123`

### Simular Mensaje Inbound (desarrollo)

```bash
# Simula mensaje de WhatsApp para testing
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WABA_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15551234567",
            "phone_number_id": "<tu-phone-number-id>"
          },
          "contacts": [{
            "profile": { "name": "Test User" },
            "wa_id": "573001234567"
          }],
          "messages": [{
            "id": "wamid.test123unique",
            "from": "573001234567",
            "timestamp": "1739900000",
            "type": "text",
            "text": { "body": "hola" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

### Intents Soportados

| Intent | Ejemplos de mensaje | Respuesta |
|--------|---------------------|-----------|
| `GREETING` | "hola", "buenos días", "hey" | Saludo personalizado por playbook |
| `HELP` | "ayuda", "menú", "opciones" | Menú de acciones disponibles |
| `SEARCH_PRODUCT` | "busco camisas", "tienes zapatos" | Lista de productos del catálogo |
| `UNKNOWN` | Cualquier otro | Respuesta LLM (o fallback) |

### Cargar Catálogo

**Método actual (JSON body):**

```bash
# Import CSV como JSON string
# Nota: El contenido CSV se envía como string en el campo "csv"
curl -X POST http://localhost:3000/api/catalog/import \
  -H "x-api-key: <merchant-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "csv": "name,description,category,sku,price,stock\nCamisa Básica,Camisa algodón 100%,Ropa,CAM-001,35000,20\nJeans Clásico,Pantalón mezclilla,Ropa,JEAN-001,85000,15"
  }'
```

**Cargar desde archivo (requiere transformación):**

```bash
# Leer archivo CSV y enviarlo como JSON
csv_content=$(cat examples/catalog-template.csv | jq -Rs .)
curl -X POST http://localhost:3000/api/catalog/import \
  -H "x-api-key: <merchant-api-key>" \
  -H "Content-Type: application/json" \
  -d "{\"csv\": $csv_content}"
```

> **⚠️ Deprecado:** Usar `POST /api/catalog/import-file` para upload directo de archivos (ver Flujo 4).

**Respuesta:**
```json
{
  "created": 10,
  "updated": 2,
  "errors": []
}
```

### Probar Búsqueda Directa (sin WhatsApp)

#### PR-03.5.2: Full-Text Search (FTS) con PostgreSQL

A partir de PR-03.5.2, la búsqueda de productos usa **PostgreSQL Full-Text Search (tsvector + GIN index)** para búsquedas por lenguaje natural, con fallback automático a ILIKE si FTS retorna 0 resultados.

**Feature Flag:**
```bash
# En .env
CATALOG_FTS_ENABLED=true   # Default: true
```

- **`true`**: Usa FTS con `plainto_tsquery('simple', ...)` + scoring `ts_rank`
- **`false`**: Usa ILIKE contains (backward compat con PR-03)

**Comportamiento:**
- Config `'simple'` (sin stemming) → soporta Spanglish: "makeup crema", "blazer negro"
- Fallback automático: si FTS retorna 0 → retry con ILIKE
- Campos indexados: `name`, `brand`, `description`, `tags`

#### Ejemplos

```bash
# Buscar productos por texto
curl "http://localhost:3000/api/products?q=camisa" \
  -H "x-api-key: <merchant-api-key>"

# Búsqueda natural (FTS): "algo para la cara" → productos skincare
curl "http://localhost:3000/api/products?q=algo%20para%20la%20cara" \
  -H "x-api-key: <merchant-api-key>"

# Spanglish: "makeup base" → productos con términos mixtos
curl "http://localhost:3000/api/products?q=makeup%20base" \
  -H "x-api-key: <merchant-api-key>"
```

```bash
# Listar todos los productos
curl "http://localhost:3000/api/products" \
  -H "x-api-key: <merchant-api-key>"
```

```bash
# Filtrar por categoría
curl "http://localhost:3000/api/products?category=Ropa&limit=10" \
  -H "x-api-key: <merchant-api-key>"
```

---

## Flujo 4: Catalog Import File Upload (PR-17)

### Descripción

Upload de archivo CSV real via `multipart/form-data` para UX drag & drop en UI.

### Pre-requisitos

1. Merchant con API key configurada
2. Archivo CSV con formato válido (ver `examples/catalog-template.csv`)
3. Tamaño máximo: configurado en `CATALOG_IMPORT_MAX_SIZE_MB` (default: 5MB)

### Formato CSV Esperado

```csv
name,description,category,sku,price,stock
Camisa Básica,Camisa algodón 100%,Ropa,CAM-001,35000,20
Jeans Clásico,Pantalón mezclilla,Ropa,JEAN-001,85000,15
```

**Campos:**
- `name` (requerido): Nombre del producto
- `description` (opcional): Descripción
- `category` (requerido): Nombre de categoría
- `sku` (requerido): Código único para idempotencia
- `price` (requerido): Precio en número decimal
- `stock` (requerido): Cantidad en stock (entero)

### Endpoint

**POST** `/api/catalog/import-file`

**Autenticación:** API Key (header `x-api-key` o `Authorization: Bearer <key>`)

**Content-Type:** `multipart/form-data`

**Form field:** `file` (tipo: File/Blob)

### Probar con cURL

#### Upload de Archivo CSV

```bash
# Upload directo de archivo (drag & drop ready)
curl -X POST http://localhost:3000/api/catalog/import-file \
  -H "x-api-key: <merchant-api-key>" \
  -F "file=@examples/catalog-template.csv"
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "created": 15,
  "updated": 0,
  "errors": []
}
```

**Archivo válido con errores parciales:**
```json
{
  "success": false,
  "created": 10,
  "updated": 3,
  "errors": [
    {
      "row": 5,
      "field": "price",
      "message": "Price must be a valid number"
    }
  ]
}
```

#### Errores Comunes

**Archivo no CSV (400):**
```bash
curl -X POST http://localhost:3000/api/catalog/import-file \
  -H "x-api-key: <merchant-api-key>" \
  -F "file=@catalog.txt"
```

Respuesta:
```json
{
  "statusCode": 400,
  "message": "Only CSV files are allowed"
}
```

**Archivo demasiado grande (413):**
```bash
# Si archivo > CATALOG_IMPORT_MAX_SIZE_MB (default: 5MB)
curl -X POST http://localhost:3000/api/catalog/import-file \
  -H "x-api-key: <merchant-api-key>" \
  -F "file=@huge-catalog.csv"
```

Respuesta:
```json
{
  "statusCode": 413,
  "message": "File size exceeds maximum allowed (5MB)"
}
```

**Sin autenticación (401):**
```bash
curl -X POST http://localhost:3000/api/catalog/import-file \
  -F "file=@catalog.csv"
```

Respuesta:
```json
{
  "statusCode": 401,
  "message": "API key is required"
}
```

### Validaciones

| Validación | Código Error | Mensaje |
|------------|--------------|---------|
| Extensión no `.csv` | 400 | "Only CSV files are allowed" |
| Tamaño > límite | 413 | "File size exceeds maximum allowed (XMB)" |
| Archivo vacío | 400 | "File is empty" |
| Sin archivo | 400 | "File is required" |
| Sin API key | 401 | "API key is required" |

### Idempotencia

El import es idempotente por SKU:
- **Producto con SKU existente:** se actualiza (no duplica)
- **Producto con SKU nuevo:** se crea

```bash
# Primera carga (crea 10 productos)
curl -X POST http://localhost:3000/api/catalog/import-file \
  -H "x-api-key: <merchant-api-key>" \
  -F "file=@catalog.csv"
# => created: 10, updated: 0

# Segunda carga (mismo archivo)
curl -X POST http://localhost:3000/api/catalog/import-file \
  -H "x-api-key: <merchant-api-key>" \
  -F "file=@catalog.csv"
# => created: 0, updated: 10 (⚠️ no duplica)
```

### Comparación con Endpoint JSON (Deprecado)

| Feature | `/api/catalog/import` (JSON) | `/api/catalog/import-file` (File) |
|---------|------------------------------|-----------------------------------|
| Content-Type | `application/json` | `multipart/form-data` |
| Payload | `{ "csv": "<contenido>" }` | `file=@archivo.csv` |
| UI Drag & Drop | ❌ (requiere transformación) | ✅ (nativo) |
| cURL | ⚠️ Complejo (jq required) | ✅ Simple (`-F`) |
| Status | ⚠️ Deprecado (header presente) | ✅ Recomendado |

**Migración:**
El endpoint JSON (`/api/catalog/import`) sigue funcional pero retorna headers de deprecación:
- `Deprecation: version="2026-04"`
- `Link: <https://docs.closy.bot/api/catalog-import-file>; rel="alternate"`

---

## Estado de Implementación

### ✅ Flujos Completamente Funcionales

| Flujo | PRs | Estado |
|-------|-----|--------|
| Login OIDC | PR-12 | ✅ Funcional |
| Agregar Channel WhatsApp | PR-13, PR-14 | ✅ Funcional |
| Saludo conversacional | PR-03.5 | ✅ Funcional |
| Ayuda/Menú | PR-03.5 | ✅ Funcional |
| Búsqueda catálogo | PR-03.5, PR-03 | ✅ Funcional |
| Respuestas LLM | PR-03.6 | ✅ Funcional (si `LLM_ENABLED=true`) |
| Catálogo CRUD/Import | PR-03.7 | ✅ Funcional |
| Catalog Import File Upload | PR-17 | ✅ Funcional (multipart/form-data) |
| Carrito CRUD conversacional | PR-04 | ✅ Funcional (ADD_TO_CART, VIEW_CART, UPDATE_CART, REMOVE_FROM_CART) |
| Checkout conversacional | PR-05 | ✅ Funcional (name → address → payment → confirm → Order) |
| Confirmar pago | PR-06 | ✅ Funcional (webhook HMAC + fallback `PAGADO`) |
| Estado pedido | PR-07 | ✅ Funcional (Intent `ORDER_STATUS` + PostSaleFlow) |
| Tickets soporte | PR-07 | ✅ Funcional (Intent `CREATE_TICKET` + modelo Ticket + notificación merchant) |
| Comandos merchant (WhatsApp) | PR-05.1 | ✅ Funcional (confirmar, rechazar, pagado, enviado, pedido, pendientes, hoy, ayuda, pausar/activar bot) |
| Message Relay (msg/handoff) | PR-05.2 | ✅ Funcional (`msg`, `handoff`, `cerrar handoff` + relay bidireccional) |
| Handoff Humano | PR-08 | ✅ Funcional (Intent `HANDOFF` + auto-escalation UNKNOWN×3 + resumen estructurado + LLM opt-in) |

---

## Testing E2E

### Ejecutar Tests

```bash
# Todos los tests
pnpm test

# Solo E2E
pnpm test:e2e

# Tests específicos
pnpm test:e2e whatsapp-webhook
pnpm test:e2e auth
pnpm test:e2e whatsapp-onboarding
pnpm test:e2e channel-health
pnpm test:e2e channel-list
```

### Tests Disponibles

| Test File | Flujo |
|-----------|-------|
| `auth.e2e-spec.ts` | Login OIDC |
| `whatsapp-onboarding.e2e-spec.ts` | Meta Embedded Signup |
| `channel-health.e2e-spec.ts` | Health + Retry |
| `channel-list.e2e-spec.ts` | List channels (PR-16) |
| `whatsapp-webhook.e2e-spec.ts` | Conversación básica |
| `whatsapp-webhook-meta.e2e-spec.ts` | Meta payload compliance |
| `catalog-management.e2e-spec.ts` | CRUD catálogo |
| `playbook-integration.e2e-spec.ts` | Playbooks por industria |

---

## Flujo 5: Configuración Merchant (PR-15)

### Descripción

Permite al merchant autenticado ver y actualizar su perfil (nombre, industria) y configurar el comportamiento del bot conversacional mediante `playbookConfig` JSON.

**Casos de uso:**
- Self-service onboarding: merchant configura su tienda sin intervención manual
- Personalización del tone y mensajes del bot
- Ajuste de reglas de negocio (upsell, recomendaciones, validaciones)
- A/B testing de diferentes configuraciones de playbook

### Pre-requisitos

1. Merchant autenticado (cookie `session_id` válida - ver Flujo 1)

### Cómo obtener el `session_id`

Después del login OIDC (Flujo 1), el `session_id` se encuentra en la cookie de respuesta:

**Opción 1: Con navegador (inspeccionar)**
```bash
# 1. Abrir en navegador
open "http://localhost:3000/auth/login/google"

# 2. Después del redirect, abrir DevTools → Application → Cookies
# 3. Copiar el valor de la cookie "session_id"
```

**Opción 2: Con cURL (desarrollo)**
```bash
# El servidor responde con Set-Cookie en el callback
curl -v "http://localhost:3000/auth/callback/google?code=..." 2>&1 | grep -i "set-cookie: session_id"

# Extraer el session_id de la respuesta
```

**Opción 3: Consultar DB directamente (desarrollo)**
```sql
-- Ver sesiones activas
SELECT session_id, merchant_id, expires_at 
FROM sessions 
WHERE expires_at > NOW() 
ORDER BY created_at DESC 
LIMIT 5;
```

### Industrias Disponibles

El campo `industry` acepta uno de estos valores:

| Valor | Descripción | Playbook por defecto |
|-------|-------------|---------------------|
| `ropa` | Tiendas de ropa, moda, accesorios | Enfoque en tallas, colores, estilos |
| `belleza` | Cosméticos, cuidado personal, spa | Tipos de piel, guardrails médicos |
| `minimarket` | Abarrotes, despensa, productos básicos | Cantidades, sustituciones, entrega rápida |
| `null` | Sin industria específica | Playbook genérico |

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/merchants/me` | Obtiene profile + playbookConfig |
| PATCH | `/merchants/me` | Actualiza name e industry |
| PUT | `/merchants/me/playbook` | Reemplaza playbookConfig completo |
| PATCH | `/merchants/me/playbook` | Merge parcial playbookConfig |

### Probar con cURL

#### 1. Ver Perfil Actual

```bash
curl -X GET http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>"
```

**Respuesta esperada (200) - Sin configuración:**
```json
{
  "id": "clxxx...",
  "name": "Mi Tienda",
  "industry": "ropa",
  "playbookConfig": null
}
```

**Respuesta esperada (200) - Con playbookConfig:**
```json
{
  "id": "clxxx...",
  "name": "Mi Tienda",
  "industry": "ropa",
  "playbookConfig": {
    "industry": "ropa",
    "llmPrompt": {
      "tone": "Eres un asesor de moda friendly y cercano...",
      "focusAreas": ["Talla", "Color", "Estilo"],
      "commonQuestions": ["¿Qué tallas tienen?"],
      "upsellStrategy": "Sugerir accesorios complementarios",
      "emojiUsage": "moderate"
    },
    "messages": {
      "greeting": "¡Hola! 👋 Bienvenido a Mi Tienda",
      "addToCartConfirm": "✅ Agregado al carrito",
      "noStock": "😔 Producto agotado",
      "upsellTemplate": "También te puede interesar: {product}",
      "checkoutStart": "¡Genial! Vamos a finalizar"
    },
    "rules": {
      "askSizeBeforeCart": true,
      "askSkinTypeOnSearch": false,
      "autoSubstitutions": false,
      "upsellEnabled": true,
      "maxRecommendations": 3
    },
    "checkoutQuestions": []
  }
}
```

#### 2. Actualizar Nombre de Tienda

```bash
curl -X PATCH http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mi Nueva Tienda"
  }'
```

**Respuesta esperada (200):**
```json
{
  "id": "clxxx...",
  "name": "Mi Nueva Tienda",
  "industry": "ropa",
  "playbookConfig": null
}
```

#### 3. Cambiar Industria

```bash
curl -X PATCH http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "industry": "belleza"
  }'
```

**Respuesta:** Profile con industry actualizado.

#### 4. Reemplazar PlaybookConfig Completo (PUT)

```bash
curl -X PUT http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "industry": "ropa",
    "llmPrompt": {
      "tone": "Eres un asesor de moda friendly y cercano. Usas un lenguaje cálido y entusiasta.",
      "focusAreas": ["Talla", "Color", "Estilo", "Ocasión"],
      "commonQuestions": [
        "¿Qué tallas tienen?",
        "¿Tienen envío gratis?",
        "¿Puedo cambiar si no me queda?"
      ],
      "upsellStrategy": "Sugerir accesorios complementarios al outfit elegido",
      "emojiUsage": "moderate"
    },
    "messages": {
      "greeting": "¡Hola! 👋 Bienvenido a {merchant_name}. ¿En qué puedo ayudarte hoy?",
      "addToCartConfirm": "✅ Agregado al carrito",
      "noStock": "😔 Este producto está agotado actualmente",
      "upsellTemplate": "También te puede interesar: {product}",
      "checkoutStart": "¡Genial! Vamos a finalizar tu pedido"
    },
    "rules": {
      "askSizeBeforeCart": true,
      "askSkinTypeOnSearch": false,
      "autoSubstitutions": false,
      "upsellEnabled": true,
      "maxRecommendations": 3
    },
    "checkoutQuestions": []
  }'
```

**Respuesta:** Profile con playbookConfig reemplazado completo.

#### 5. Actualizar Solo el Tono (PATCH - Merge Parcial)

```bash
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "llmPrompt": {
      "tone": "Eres un vendedor profesional y elegante. Usas lenguaje formal."
    }
  }'
```

**Respuesta:** Profile con playbookConfig mergeado (solo `tone` actualizado, resto intacto).

#### 6. Actualizar Mensajes Personalizados

```bash
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": {
      "greeting": "Bienvenido a nuestra boutique exclusiva",
      "addToCartConfirm": "Producto agregado exitosamente"
    }
  }'
```

**Respuesta:** Solo los mensajes especificados se actualizan, el resto permanece igual.

#### 7. Actualizar Reglas de Comportamiento

```bash
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": {
      "upsellEnabled": false,
      "maxRecommendations": 5
    }
  }'
```

#### 8. Ejemplo de Error: Sin Autenticación (401)

```bash
curl -X GET http://localhost:3000/merchants/me
```

**Respuesta esperada (401):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

#### 9. Ejemplo de Error: Config Incompleto en PUT (400)

```bash
curl -X PUT http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "industry": "ropa",
    "llmPrompt": {
      "tone": "friendly"
    }
  }'
```
# Opción A: Desde archivo JSON
   curl -X PUT http://localhost:3000/merchants/me/playbook \
     -H "Cookie: session_id=<session-id>" \
     -H "Content-Type: application/json" \
     -d @examples/playbook-ropa-custom.json
   
   # Opción B: Inline (más rápido para testing)
   curl -X PUT http://localhost:3000/merchants/me/playbook \
     -H "Cookie: session_id=<session-id>" \
     -H "Content-Type: application/json" \
     -d '{
       "industry": "ropa",
       "llmPrompt": {
         "tone": "Friendly y profesional",
         "focusAreas": ["Talla", "Color"],
         "commonQuestions": ["¿Tienen envío gratis?"],
         "upsellStrategy": "Accesorios",
         "emojiUsage": "moderate"
       },
       "messages": {
### Tips y Buenas Prácticas

#### 1. Testing Iterativo con PATCH

Para ajustar configuración sin reescribir todo (útil para A/B testing):

```bash
# Probar tone formal
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<session-id>" \
  -H "Content-Type: application/json" \
  -d '{ "llmPrompt": { "tone": "Formal y elegante" } }'

# Si no funciona, probar tone casual
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<session-id>" \
  -H "Content-Type: application/json" \
  -d '{ "llmPrompt": { "tone": "Casual y divertido" } }'
```

#### 2. Validar antes de aplicar

Para evitar errores 400, validar estructura localmente:

```bash
# Guardar config en archivo
cat > test-playbook.json <<EOF
{
  "industry": "ropa",
  "llmPrompt": { ... },
  "messages": { ... },
  "rules": { ... },
  "checkoutQuestions": []
}
EOF

# Validar JSON
jq empty test-playbook.json && echo "✅ JSON válido" || echo "❌ JSON inválido"

# Aplicar
curl -X PUT http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<session-id>" \
  -H "Content-Type: application/json" \
  -d @test-playbook.json
```

#### 3. Backup de configuración actual

Antes de cambios importantes:

```bash
# Guardar config actual
curl -X GET http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<session-id>" \
  | jq '.playbookConfig' > backup-playbook-$(date +%Y%m%d).json

# Si algo sale mal, restaurar
curl -X PUT http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<session-id>" \
  -H "Content-Type: application/json" \
  -d @backup-playbook-20260219.json
```

#### 4. Validación de campos individuales

El sistema valida:

- `llmPrompt.focusAreas`: debe ser array
- `llmPrompt.emojiUsage`: solo 'none', 'moderate', 'frequent'
- `rules.maxRecommendations`: número entre 0 y 10
- `checkoutQuestions`: debe ser array
- `messages`: todos los campos de tipo string

#### 5. Variables dinámicas en mensajes

Usar placeholders en `messages`:

- `{merchant_name}`: se reemplaza con el nombre de la tienda
- `{product}`: se reemplaza con nombre del producto (en upsellTemplate)

Ejemplo:
```json
{
  "messages": {
    "greeting": "Bienvenido a {merchant_name}! 👋",
    "upsellTemplate": "También te puede gustar {product}"
  }
}
```

         "greeting": "¡Hola! 👋",
         "addToCartConfirm": "✅ Agregado",
         "noStock": "Agotado",
         "upsellTemplate": "Te interesa: {product}",
         "checkoutStart": "Finalizamos"
       },
       "rules": {
         "askSizeBeforeCart": true,
         "askSkinTypeOnSearch": false,
         "autoSubstitutions": false,
         "upsellEnabled": true,
         "maxRecommendations": 3
       },
       "checkoutQuestions": []
     }'
  "statusCode": 400,
  "message": "PlaybookConfig is incomplete. Missing fields: messages, rules, checkoutQuestions"
}
```

### Flujo Completo: Onboarding con Configuración Personalizada

1. **Login OIDC** (Flujo 1):
   ```bash
   # Abrir en navegador
   open "http://localhost:3000/auth/login/google"
   # Copiar session_id de la cookie
   ```

2. **Ver perfil actual**:
   ```bash
   curl -X GET http://localhost:3000/merchants/me \
     -H "Cookie: session_id=<session-id>"
   ```

3. **Configurar industria**:
   ```bash
   curl -X PATCH http://localhost:3000/merchants/me \
     -H "Cookie: session_id=<session-id>" \
     -H "Content-Type: application/json" \
     -d '{ "industry": "ropa" }'
   ```

4. **Cargar playbook personalizado**:
   ```bash
   curl -X PUT http://localhost:3000/merchants/me/playbook \
     -H "Cookie: session_id=<session-id>" \
     -H "Content-Type: application/json" \
     -d @playbook-ropa-custom.json
   ```

5. **Conectar WhatsApp** (Flujo 2):
   ```bash
   open "http://localhost:3000/onboarding/whatsapp/start"
   ```

6. **Cargar catálogo** (Flujo 3):
   ```bash
   # Opción A: Inline (para testing rápido)
   curl -X POST http://localhost:3000/api/catalog/import \
     -H "x-api-key: <merchant-api-key>" \
     -H "Content-Type: application/json" \
     -d '{"csv": "name,description,category,sku,price,stock\nCamisa,Algodón 100%,Ropa,CAM-001,35000,20"}'
   
   # Opción B: Desde archivo (requiere jq)
   csv_content=$(cat catalog.csv | jq -Rs .)
   curl -X POST http://localhost:3000/api/catalog/import \
     -H "x-api-key: <merchant-api-key>" \
     -H "Content-Type: application/json" \
     -d "{\"csv\": $csv_content}"
   ```

7. **Probar bot** vía WhatsApp con configuración personalizada aplicada.

---

## Flujo 5.5: Merchant Config — Políticas operativas (PR-04.5)

### Descripción

Permite al merchant autenticado gestionar su configuración operativa: métodos de pago aceptados, política de envío, política de devolución, moneda y prefijo del código de orden.  
Si no existe config, se crea automáticamente con el preset de la industria del merchant.

**Endpoints:**

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/merchants/me/config` | Session Cookie | Obtiene config con presets aplicados |
| PATCH | `/merchants/me/config` | Session Cookie | Actualiza solo los campos enviados |

**Industrias y presets:**

| Industry | `orderCodePrefix` | Métodos de pago | Envío |
|----------|-------------------|-----------------|-------|
| `ropa` | `ORD` | COD + Transfer | Tarifa plana $10.000 |
| `belleza` | `ORDEN` | COD + Transfer + Link | Gratis sobre $50.000 |
| `minimarket` | `PED` | Solo COD | Mismo día |

### Pre-requisitos

1. Merchant autenticado (cookie `session_id` válida - ver Flujo 1)

---

### Probar con cURL

#### 1. Obtener config actual (auto-crea con preset si no existe)

```bash
curl -X GET http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>"
```

**Respuesta esperada (200):**
```json
{
  "id": "clxxx...",
  "merchantId": "clyyy...",
  "paymentMethods": [
    { "type": "cod", "label": "Contraentrega" },
    { "type": "transfer", "label": "Transferencia bancaria" }
  ],
  "shippingConfig": {
    "flatRate": 10000,
    "estimatedDays": "3-5 días hábiles"
  },
  "returnPolicy": "Aceptamos cambios hasta 10 días...",
  "currency": "COP",
  "orderCodePrefix": "ORD",
  "autoConfirmCod": true,
  "createdAt": "2026-02-24T21:00:00.000Z",
  "updatedAt": "2026-02-24T21:00:00.000Z"
}
```

#### 2. Actualizar solo `returnPolicy` (PATCH parcial)

```bash
curl -X PATCH http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "returnPolicy": "Cambios hasta 15 días con producto sin usar y con etiquetas originales."
  }'
```

**Respuesta esperada (200):** Igual que GET pero con `returnPolicy` actualizado. Todos los demás campos sin cambio.

#### 3. Actualizar métodos de pago con info bancaria

```bash
curl -X PATCH http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMethods": [
      { "type": "cod", "label": "Contraentrega" },
      {
        "type": "transfer",
        "label": "Transferencia Bancolombia",
        "instructions": "Enviar comprobante al WhatsApp después de transferir.",
        "bankInfo": {
          "bankName": "Bancolombia",
          "accountNumber": "1234567890",
          "accountType": "ahorros",
          "accountHolder": "Mi Tienda SAS"
        }
      }
    ]
  }'
```

#### 4. Actualizar config de envío

```bash
curl -X PATCH http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "shippingConfig": {
      "flatRate": 8000,
      "freeAbove": 100000,
      "estimatedDays": "2-3 días hábiles",
      "zones": ["Bogotá", "Medellín", "Cali"]
    }
  }'
```

#### 5. Actualizar varios campos a la vez

```bash
curl -X PATCH http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "currency": "COP",
    "orderCodePrefix": "ORDEN",
    "autoConfirmCod": false
  }'
```

#### 6. Error — tipo de pago inválido (400)

```bash
curl -X PATCH http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMethods": [{ "type": "bitcoin", "label": "Cripto" }]
  }'
```

**Respuesta esperada (400):**
```json
{
  "statusCode": 400,
  "message": ["paymentMethods.0.type must be one of the following values: cod, transfer, payment_link"],
  "error": "Bad Request"
}
```

#### 7. Error — sin autenticación (401)

```bash
curl -X GET http://localhost:3000/merchants/me/config
```

**Respuesta esperada (401):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

### PR-FE-OB-2: Wizard step-customize — Campos nuevos (businessHours, paymentLinkUrl, shippingPolicy)

#### 8. Guardar config completa desde step-customize (pagos + políticas + horario)

```bash
curl -X PATCH http://localhost:3000/merchants/me/config \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMethods": [
      { "type": "cod", "label": "Efectivo / Pago contra entrega" },
      {
        "type": "transfer",
        "label": "Transferencia / Nequi",
        "bankInfo": {
          "bankName": "Bancolombia",
          "accountNumber": "12345678",
          "accountType": "ahorros",
          "accountHolder": "Mi Tienda S.A.S"
        }
      },
      {
        "type": "payment_link",
        "label": "Link de pago",
        "paymentLinkUrl": "https://link.mercadopago.com.co/mi-tienda"
      }
    ],
    "shippingConfig": {
      "shippingPolicy": "Envíos a toda Colombia. Tiempo: 3-5 días hábiles. Costo según ciudad."
    },
    "returnPolicy": "Aceptamos cambios dentro de 8 días. Producto sin uso y con etiquetas.",
    "businessHours": "Lunes a Viernes 9am-6pm, Sábados 9am-1pm"
  }'
```

**Respuesta esperada (200):**
```json
{
  "id": "cm...",
  "merchantId": "cm...",
  "paymentMethods": [...],
  "shippingConfig": { "shippingPolicy": "Envíos a toda Colombia..." },
  "returnPolicy": "Aceptamos cambios dentro de 8 días...",
  "businessHours": "Lunes a Viernes 9am-6pm, Sábados 9am-1pm",
  "currency": "COP",
  "orderCodePrefix": "ORD",
  "autoConfirmCod": true,
  "createdAt": "2026-02-26T...",
  "updatedAt": "2026-02-26T..."
}
```

#### 9. Guardar FAQs desde step-customize (PATCH /merchants/me/playbook)

```bash
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "faqs": [
      {
        "question": "¿Cuánto demora el envío?",
        "keywords": ["envio", "demora", "llega", "tiempo", "dias"],
        "answer": "Los envíos demoran 3-5 días hábiles después de confirmar tu pago 📦"
      },
      {
        "question": "¿Qué métodos de pago aceptan?",
        "keywords": ["pago", "pagar", "nequi", "transferencia", "efectivo"],
        "answer": "Aceptamos efectivo contra entrega, transferencia/Nequi y links de pago 💳"
      }
    ]
  }'
```

**Respuesta esperada (200):**
```json
{ "id": "cm..." }
```

---

## Flujo 5.6: FAQ Automáticas — PlaybookConfig + FaqFlow (PR-GAP-2)

### Descripción

Respuestas automáticas a preguntas frecuentes (envío, devoluciones, pagos, horarios) usando keyword matching sobre array de FAQs en `PlaybookConfig`. Sin RAG, sin embeddings, sin costo LLM.

**Casos de uso:**
- Cliente pregunta "¿Cuánto demora el envío?" → bot responde con FAQ configurada
- Merchant actualiza sus FAQs via PATCH /merchants/me/playbook
- Preguntas no cubiertas → fallback a búsqueda/respuesta genérica

### Auth

- **Session cookie** (`connect.sid`) — mismo que dashboard login OIDC
- Obtener cookie en [Flujo 1](#flujo-1-login-oidc-pr-12)

---

### cURL 5.6.1 — Ver FAQs actuales del merchant

```bash
curl -s http://localhost:3000/api/merchants/me/playbook \
  -H "Cookie: connect.sid=<TU_SESSION_COOKIE>" | jq '.faqs'
```

**Respuesta esperada:**
```json
[
  {
    "question": "¿Cuánto demora el envío?",
    "keywords": ["envio", "demora", "llega"],
    "answer": "Los envíos demoran 3-5 días hábiles 📦"
  },
  ...
]
```

---

### cURL 5.6.2 — Actualizar FAQs del merchant (PATCH)

> **Nota:** Usa el endpoint existente `PATCH /merchants/me/playbook`. El campo `faqs` reemplaza el array completo (merge por reemplazo total).

```bash
curl -s -X PATCH http://localhost:3000/api/merchants/me/playbook \
  -H "Cookie: connect.sid=<TU_SESSION_COOKIE>" \
  -H "Content-Type: application/json" \
  -d '{
    "faqs": [
      {
        "question": "¿Cuánto demora el envío?",
        "keywords": ["envio", "demora", "llega", "dias"],
        "answer": "Los envíos demoran 3-5 días hábiles 📦"
      },
      {
        "question": "¿Hacen cambios de talla?",
        "keywords": ["cambio", "devolver", "talla"],
        "answer": "Aceptamos cambios hasta 15 días después de recibir tu pedido 👗"
      },
      {
        "question": "¿Cómo puedo pagar?",
        "keywords": ["pago", "transferencia", "efectivo"],
        "answer": "Aceptamos transferencia y pago contra entrega 💳"
      }
    ]
  }' | jq .
```

**Respuesta esperada (200 OK):**
```json
{
  "success": true,
  "playbookConfig": {
    "faqs": [
      {
        "question": "¿Cuánto demora el envío?",
        "keywords": ["envio", "demora", "llega", "dias"],
        "answer": "Los envíos demoran 3-5 días hábiles 📦"
      },
      ...
    ]
  }
}
```

---

### cURL 5.6.3 — Limpiar FAQs (array vacío)

```bash
curl -s -X PATCH http://localhost:3000/api/merchants/me/playbook \
  -H "Cookie: connect.sid=<TU_SESSION_COOKIE>" \
  -H "Content-Type: application/json" \
  -d '{ "faqs": [] }' | jq .
```

---

### cURL 5.6.4 — Simular pregunta FAQ via WhatsApp webhook

```bash
curl -s -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=test" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "test-account",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "<PHONE_NUMBER_ID>" },
          "messages": [{
            "id": "faq-test-001",
            "from": "5491112345678",
            "timestamp": "1708800000",
            "type": "text",
            "text": { "body": "¿Cuánto demora el envío?" }
          }]
        },
        "field": "messages"
      }]
    }]
  }' | jq .
```

**Respuesta esperada:** `{ "ok": true }` — el bot responde con el FAQ answer configurado.

---

### Configuración FAQ_MATCH_THRESHOLD

```bash
# En .env: mínimo de keywords que deben matchear para activar FAQ
FAQ_MATCH_THRESHOLD=1
```

- `1` (default): basta con 1 keyword para activar FAQ (más sensible)
- `2`: requiere 2 keywords simultáneas (menos falsos positivos)

### Keywords — buenas prácticas

- Usar **sin tildes**: `"envio"` no `"envío"`, `"devolucion"` no `"devolución"`
- Usar **minúsculas**: el sistema normaliza automáticamente
- Keywords **específicas** tienen menos colisiones que genéricas
- Keywords de FAQs **no compiten** con intents del router — FaqFlow corre solo si el router clasifica `QUERY_FAQ`

---

## Flujo 6: Cart CRUD Conversacional (PR-04)



### Descripción

Sistema de carrito de compras conversacional integrado con WhatsApp. Permite a los clientes agregar/ver/modificar/eliminar productos mediante lenguaje natural, con TTL dinámico y validaciones de stock.

**Casos de uso:**
- Cliente agrega productos al carrito: "Quiero 2 camisas rojas"
- Cliente consulta su carrito: "Qué tengo en mi carrito?"
- Cliente modifica cantidad: "Cambia las camisas a 3"
- Cliente elimina items: "Quita la camisa azul"
- Sistema maneja duplicados incrementando cantidad automáticamente
- Carrito expira después de 24h de inactividad (configurable por playbook)
- TTL se refresca con cada operación (agregar/modificar/eliminar)

### Modelos

#### Cart (PostgreSQL)

```prisma
model Cart {
  id          String      @id @default(cuid())
  customerId  String      // FK to Customer.id (Customer.phone holds actual number)
  merchantId  String
  status      CartStatus  @default(active) // active | abandoned | completed
  expiresAt   DateTime    // TTL: default 24h desde última interacción
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  
  items       CartItem[]
  customer    Customer    @relation(fields: [customerId], references: [id])
  merchant    Merchant    @relation(fields: [merchantId], references: [id])
  
  @@index([customerId, merchantId, status])
  @@index([expiresAt])  // Para cleanup job
  @@map("carts")
}

enum CartStatus {
  active     // Carrito en uso
  abandoned  // Expirado por TTL (candidato para recordatorio)
  completed  // Convertido a Order (PR-05)
}
```

#### CartItem (PostgreSQL)

```prisma
model CartItem {
  id            String   @id @default(cuid())
  cartId        String
  variantId     String
  quantity      Int      // 1-99
  priceSnapshot Decimal  // Precio al momento de agregar (inmutable)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  cart          Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant       ProductVariant @relation(fields: [variantId], references: [id])
  
  @@unique([cartId, variantId])  // Evita duplicados (se incrementa qty)
  @@index([cartId])
  @@map("cart_items")
}
```

**Guardrails:**
- `priceSnapshot`: Capturado de `variant.price` al agregar (bot NO inventa precios)
- `quantity`: Rango 1-99 validado en CartService
- `unique [cartId, variantId]`: Duplicados incrementan quantity en vez de crear nueva fila

### Intents Conversacionales

| Intent | Keywords | Confidence | Descripción |
|--------|----------|------------|-------------|
| `ADD_TO_CART` | agregar, añadir, quiero, me interesa, agregar al carrito, añadir al carrito | 0.85 | Agregar producto (con cantidad opcional) |
| `VIEW_CART` | carrito, ver carrito, mostrar carrito, qué tengo, mi carrito, pedido, ver pedido | 0.80 | Ver resumen del carrito actual |
| `UPDATE_CART` | cambiar cantidad, modificar, actualizar, cambiar a, actualizar cantidad | 0.75 | Cambiar quantity de un item |
| `REMOVE_FROM_CART` | quitar, eliminar, remover, borrar, sacar, quitar del carrito | 0.80 | Eliminar item del carrito |

**Prioridad de clasificación:**
1. `ADD_TO_CART` se verifica ANTES de `VIEW_CART` para evitar colisión con "agregar al carrito"
2. Si múltiples intents coinciden, se usa el de mayor confidence

### Ejemplos WhatsApp

#### 1. Agregar al Carrito (ADD_TO_CART)

**Cliente:**
```
Quiero 2 camisas rojas
```

**Bot procesa:**
1. IntentRouter clasifica como `ADD_TO_CART` (keywords: "quiero")
2. CartFlow.handleAddToCart extrae:
   - Producto: "camisas rojas" (búsqueda fuzzy en catálogo)
   - Cantidad: 2 (regex `\b(\d+)\b` en texto)
3. CartService.addItem valida:
   - Stock disponible: `variant.stock >= 2`
   - Snapshot precio: `priceSnapshot = variant.price`
   - Duplicado: Si ya existe, incrementa `quantity += 2`
   - TTL refresh: `expiresAt = now() + 24h`

**Bot responde:**
```
✅ Agregado al carrito:
• Camisa Roja Talla M x2 - $70.000

Total del carrito: $70.000 (2 items)
```

#### 2. Ver Carrito (VIEW_CART)

**Cliente:**
```
Qué tengo en mi carrito?
```

**Bot responde:**
```
🛒 Tu carrito:

1. Camisa Roja Talla M x2 - $70.000
2. Pantalón Azul Talla L x1 - $120.000

Total: $190.000 (3 items)

¿Quieres agregar algo más o finalizar tu pedido?
```

#### 3. Modificar Cantidad (UPDATE_CART)

**Cliente:**
```
Cambia las camisas a 3
```

**Bot procesa:**
1. Busca item "camisas" en carrito actual
2. Valida cantidad: 1 <= 3 <= 99 ✓
3. Valida stock: `variant.stock >= 3` ✓
4. Actualiza quantity: 2 → 3
5. Refresca TTL: `expiresAt = now() + 24h`

**Bot responde:**
```
✅ Cantidad actualizada:
• Camisa Roja Talla M x3 - $105.000

Total del carrito: $225.000 (4 items)
```

#### 4. Eliminar Item (REMOVE_FROM_CART)

**Cliente:**
```
Quita la camisa azul
```

**Bot procesa:**
1. Busca item "camisa azul" en carrito
2. Elimina CartItem
3. Refresca TTL del Cart

**Bot responde:**
```
❌ Producto eliminado del carrito:
• Camisa Azul Talla S

Total del carrito: $120.000 (1 item)
```

#### 5. Agregar Duplicado (Incrementa Quantity)

**Cliente tiene:** Camisa Roja x2 en carrito

**Cliente:**
```
Agregar 3 camisas rojas más
```

**Bot procesa:**
1. Detecta unique constraint `[cartId, variantId]`
2. En vez de crear nueva fila: `quantity = 2 + 3 = 5`

**Bot responde:**
```
✅ Cantidad incrementada:
• Camisa Roja Talla M x5 - $175.000

Total del carrito: $175.000 (5 items)
```

### TTL Behavior (Time-To-Live)

#### Configuración

**Default:** 24 horas desde última interacción

**Playbook Configurable:**
```typescript
// apps/api/src/domain/entities/playbook-config.interface.ts
interface CartConfig {
  ttlHours: number;  // Default: 24
}
```

**Ejemplo en playbook:**
```json
{
  "industry": "ropa",
  "cartConfig": {
    "ttlHours": 48
  }
}
```

**Fallback:** Si `playbookConfig.cartConfig` no existe, usa `CART_TTL_HOURS` (env var) o 24h.

#### Eventos que Refrescan TTL

| Operación | Método | TTL Refresh |
|-----------|--------|-------------|
| Crear carrito | `createOrGetActiveCart()` | ✅ `expiresAt = now() + ttlHours` |
| Agregar item | `addItem()` | ✅ Refresca después de agregar |
| Modificar cantidad | `updateQuantity()` | ✅ Refresca después de modificar |
| Eliminar item | `removeItem()` | ✅ Refresca después de eliminar |
| Ver carrito | `getCartSummary()` | ❌ Solo lectura, no refresca |

#### Cleanup Job

```typescript
// apps/api/src/workers/cart-cleanup.service.ts
@Cron('0 */6 * * *')  // Cada 6 horas
async handleExpiredCarts() {
  const abandoned = await this.cartService.markExpiredCartsAsAbandoned();
  // Status: active → abandoned
  // Trigger: abandoned reminders (PR-08)
}
```

**Query:**
```sql
-- Encuentra carritos expirados
SELECT * FROM carts 
WHERE status = 'active' 
  AND expires_at < NOW();
```

### Edge Cases

#### 1. Stock Insuficiente

**Escenario:** Cliente intenta agregar quantity > stock disponible

**Cliente:**
```
Quiero 10 camisas rojas
```

**Bot valida:**
```typescript
if (variant.stock < requestedQuantity) {
  throw new BadRequestException('Stock insuficiente');
}
```

**Bot responde:**
```
😔 Solo tenemos 5 unidades disponibles de Camisa Roja Talla M.
¿Quieres agregar las 5 disponibles?
```

#### 2. Carrito Expirado

**Escenario:** Cliente intenta operar sobre carrito con `expiresAt < now()`

**Bot:**
1. Cleanup job ya marcó como `status: abandoned`
2. `findActiveCart()` retorna `null` (filtra `status != active` y `expiresAt < now()`)
3. Se crea nuevo carrito vacío

**Respuesta:**
```
Tu carrito anterior expiró. He creado uno nuevo.
¿En qué puedo ayudarte?
```

#### 3. Quantity Fuera de Rango

**Escenario:** Cliente pide quantity < 1 o > 99

**Cliente:**
```
Cambiar camisas a 150
```

**Bot valida:**
```typescript
if (quantity < 1 || quantity > 99) {
  throw new BadRequestException('Cantidad debe estar entre 1 y 99');
}
```

**Bot responde:**
```
La cantidad debe estar entre 1 y 99.
Por favor, ingresa una cantidad válida.
```

#### 4. Item No Encontrado en Carrito

**Escenario:** Cliente intenta modificar/eliminar item que no está en carrito

**Cliente:**
```
Quita el pantalón verde
```

**Bot valida:**
```typescript
const item = cart.items.find(i => fuzzyMatch(i.variant.name, query));
if (!item) {
  return 'No encontré ese producto en tu carrito';
}
```

#### 5. Producto No Encontrado en Catálogo

**Escenario:** Cliente intenta agregar producto que no existe

**Cliente:**
```
Quiero una moto
```

**Bot busca:**
1. SearchCatalogService.findVariants('moto') → `[]`

**Bot responde:**
```
No encontré "moto" en nuestro catálogo.
¿Quieres ver nuestros productos disponibles?
```

### Testing

#### Vía WhatsApp (Recomendado)

**Pre-requisitos:**
1. Merchant con WhatsApp channel conectado (Flujo 2)
2. Catálogo cargado con productos (Flujo 4)
3. Playbook configurado (Flujo 5 - opcional)

**Flujo completo:**

```
# 1. Agregar producto
Cliente: "Quiero 2 camisas rojas"
Bot: ✅ Agregado al carrito...

# 2. Agregar más (duplicado incrementa)
Cliente: "Agregar 1 camisa roja más"
Bot: ✅ Cantidad incrementada: x3...

# 3. Ver carrito
Cliente: "Ver mi carrito"
Bot: 🛒 Tu carrito: ...

# 4. Modificar cantidad
Cliente: "Cambiar camisas a 5"
Bot: ✅ Cantidad actualizada...

# 5. Eliminar item
Cliente: "Quita las camisas"
Bot: ❌ Producto eliminado...

# 6. Verificar carrito vacío
Cliente: "Ver carrito"
Bot: Tu carrito está vacío.
```

#### Vía Tests (Automatizado)

```bash
# Tests unitarios
pnpm test cart.service.spec.ts      # 9 tests (AC-03, AC-04, AC-06, AC-13, cleanup)
pnpm test cart.repository.spec.ts   # 6 tests (AC-03)
pnpm test cart.flow.spec.ts         # 10 tests (AC-07, AC-08, AC-09, AC-10, AC-11, AC-12)

# Tests de integración
pnpm test conversation.orchestrator.spec.ts  # AC-12 routing

# Todos los tests de cart
pnpm test cart
# => 25 tests passing
```

#### Verificar TTL en DB

```sql
-- Ver carritos activos con TTL
SELECT 
  id,
  customer_id,
  status,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - NOW())) / 3600 AS hours_remaining
FROM carts
WHERE status = 'active'
ORDER BY expires_at ASC;

-- Ver items en carrito
SELECT 
  ci.id,
  ci.quantity,
  ci.price_snapshot,
  v.name AS product_name
FROM cart_items ci
JOIN product_variants v ON ci.variant_id = v.id
WHERE ci.cart_id = '<cart-id>';
```

#### Simular TTL Expiration

```sql
-- Forzar expiración de carrito para testing
UPDATE carts 
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE id = '<cart-id>';

-- Ejecutar cleanup job manualmente
-- (o esperar 6 horas para cron)
```

#### Validar Playbook TTL Config

```bash
# 1. Configurar TTL custom en playbook
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "cartConfig": {
      "ttlHours": 48
    }
  }'

# 2. Crear carrito vía WhatsApp
# (enviar mensaje "quiero una camisa")

# 3. Verificar TTL en DB
SELECT 
  c.expires_at,
  EXTRACT(EPOCH FROM (c.expires_at - c.created_at)) / 3600 AS ttl_hours
FROM carts c
JOIN customers cu ON c.customer_id = cu.id
WHERE cu.phone = '<phone-number>'  -- e.g., '+573001234567'
ORDER BY c.created_at DESC
LIMIT 1;
# => ttl_hours debe ser ~48
```

### Acceptance Criteria (PR-04)

**Implementados:**
- ✅ **AC-01 a AC-13**: Todos los ACs del brief con evidencia en tests
  - AC-01, AC-02: Migración + modelos (schema.prisma)
  - AC-03: CartRepository CRUD + tests (6 tests)
  - AC-04: Price snapshot (test unitario)
  - AC-05: Increment quantity en duplicados (test unitario)
  - AC-06: Stock validation (test unitario)
  - AC-07: AddToCartFlow agrega producto y responde confirmación (test flow)
  - AC-08: ViewCartFlow muestra items con formato WhatsApp + subtotal (test flow)
  - AC-09: UpdateQuantity flow (test conversacional)
  - AC-10: AddToCart flow con quantity extraction (test conversacional)
  - AC-11: ViewCart flow (test conversacional)
  - AC-12: Orchestrator routing ADD_TO_CART (test integración)
  - AC-13: TTL configurable por playbook + refresh en operaciones (test + playbook configs)

**Coverage:** 25 tests passing
- 6 repository tests (cart.repository.spec.ts)
- 9 service tests (cart.service.spec.ts)
- 10 flow tests (cart.flow.spec.ts + conversation.orchestrator.spec.ts)

---

## Flujo 6.1: Comandos de Operaciones del Merchant (PR-05.1)

El merchant gestiona pedidos desde WhatsApp enviando comandos de texto. El mensaje **debe provenir del `whatsappNumber` registrado en `Merchant`** — de lo contrario, es procesado como cliente.

**Prerrequisitos:**
- Merchant con `whatsappNumber` configurado
- Canal WhatsApp activo (`Channel.externalId = phoneNumberId`)
- Órdenes creadas (ver Flujo 7)

**Auth:** Webhook Signature (Meta) — igual que todos los webhooks WhatsApp.

### Comandos disponibles

| Comando | Descripción | Transición |
|----|----|----|
| `confirmar ORD-001` | Confirma pedido | `pending_payment → confirmed` |
| `rechazar ORD-001 [motivo]` | Rechaza pedido | `pending_payment/confirmed → cancelled` |
| `pagado ORD-001` | Marca como pagado | `confirmed → paid` |
| `enviado ORD-001` | Marca como enviado | `confirmed/paid → shipped` |
| `pedido ORD-001` | Detalle de un pedido | — |
| `pendientes` | Lista pedidos pendientes/confirmados | — |
| `hoy` | Resumen del día (cantidad + total) | — |
| `ayuda` | Muestra todos los comandos | — |
| `pausar bot` | Pausa el bot (no atiende clientes) | `botPaused = true` |
| `activar bot` | Reactiva el bot | `botPaused = false` |

---

### Simular comando del merchant vía webhook

El campo `from` del webhook debe coincidir con `Merchant.whatsappNumber`.

```bash
# Confirmar pedido ORD-001
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-1",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-001",
            "timestamp": "1700000000",
            "type": "text",
            "text": { "body": "confirmar ORD-001" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Respuesta esperada:** HTTP 200. El merchant recibe un OutboxMessage con `✅ Pedido ORD-001 confirmado`. El cliente recibe notificación automática.

---

### Rechazar pedido con motivo

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-2",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-002",
            "timestamp": "1700000001",
            "type": "text",
            "text": { "body": "rechazar ORD-001 no hay stock" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

---

### Ver detalle de un pedido

```bash
# Reemplaza "pedido" por el comando y el código de orden
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-3",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-003",
            "timestamp": "1700000002",
            "type": "text",
            "text": { "body": "pedido ORD-001" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

---

### Listar pedidos pendientes

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-4",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-004",
            "timestamp": "1700000003",
            "type": "text",
            "text": { "body": "pendientes" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

---

### Resumen del día

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-5",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-005",
            "timestamp": "1700000004",
            "type": "text",
            "text": { "body": "hoy" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

---

### Pausar y activar el bot

```bash
# Pausar bot (clientes no reciben respuestas automáticas)
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-6",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-006",
            "timestamp": "1700000005",
            "type": "text",
            "text": { "body": "pausar bot" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'

# Activar bot
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-7",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15550000001",
            "phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"
          },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.cmd-007",
            "timestamp": "1700000006",
            "type": "text",
            "text": { "body": "activar bot" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

---

### Marcar como pagado / enviado

```bash
# Pagado
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"id": "entry-8","changes": [{"value": {"messaging_product": "whatsapp","metadata": {"display_phone_number": "15550000001","phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"},"messages": [{"from": "<MERCHANT_WHATSAPP_NUMBER>","id": "wamid.cmd-008","timestamp": "1700000007","type": "text","text": {"body": "pagado ORD-001"}}]},"field": "messages"}]}]}'

# Enviado
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"id": "entry-9","changes": [{"value": {"messaging_product": "whatsapp","metadata": {"display_phone_number": "15550000001","phone_number_id": "<CHANNEL_PHONE_NUMBER_ID>"},"messages": [{"from": "<MERCHANT_WHATSAPP_NUMBER>","id": "wamid.cmd-009","timestamp": "1700000008","type": "text","text": {"body": "enviado ORD-001"}}]},"field": "messages"}]}]}'
```

---

### Notas importantes

- **Idempotencia:** Si el pedido ya está en el estado destino, el comando responde con `ℹ️` sin duplicar notificaciones.
- **Transiciones válidas:**
  - `pending_payment → confirmed | cancelled`
  - `confirmed → paid | shipped | cancelled`
  - `paid → shipped`
  - `shipped → delivered`
- **Comandos case-insensitive:** `CONFIRMAR ORD-001` = `confirmar ORD-001` = `Confirmar ORD-001`.
- **Tildes opcionales:** `confirmar` = `confírmar`.
- **Bot pausado:** mientras `Merchant.botPaused = true`, ningún mensaje de cliente genera respuesta.

**Coverage (PR-05.1):**
- 27 tests `merchant-command-parser.service.spec.ts`
- 22 tests `merchant-command.service.spec.ts`
- 15 tests e2e `merchant-commands.e2e-spec.ts`
- 3 tests adicionales en `conversation.orchestrator.spec.ts`

---

## Flujo 6.2: Message Relay — Merchant ↔ Cliente vía Bot (PR-05.2)

Relay bidireccional: el merchant puede enviar mensajes ad-hoc a un cliente (`msg`) o activar un modo handoff donde los mensajes del cliente se relayean al merchant directamente (sin pasar por flows/LLM).

**Prerrequisitos:**
- Merchant con `whatsappNumber` configurado
- Canal WHATSAPP activo con `externalId` (phone_number_id)
- Pedido creado en DB con `orderCode` conocido

**Auth:** Webhook signature (mismo patrón PR-03.8) — no requiere API Key

---

### Flujo 6.2.1 — Comando `msg`: Mensaje ad-hoc al cliente

```bash
# Merchant envía mensaje directo al cliente del pedido ORD-001
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "<CHANNEL_PHONE_ID>" },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.relay-test-001",
            "timestamp": "1708560000",
            "type": "text",
            "text": { "body": "msg ORD-001 Tu pedido sale mañana entre 2-4pm" }
          }]
        }
      }]
    }]
  }'
```

**Resultado esperado:**
- El merchant recibe confirmación: `"✅ Mensaje enviado a cliente de ORD-001"`
- El cliente recibe: `"Mensaje de Tienda Maria: Tu pedido sale mañana entre 2-4pm"`
- OutboxMessage creado con `to = customer.phone`
- MessageLog creado con `source = 'relay'`, `direction = OUT`

---

### Flujo 6.2.2 — Comando `handoff`: Activar relay bidireccional

```bash
# Merchant activa handoff para el pedido ORD-001
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "<CHANNEL_PHONE_ID>" },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.relay-test-002",
            "timestamp": "1708560100",
            "type": "text",
            "text": { "body": "handoff ORD-001" }
          }]
        }
      }]
    }]
  }'
```

**Resultado esperado:**
- Merchant recibe: `"✅ Handoff activo para ORD-001. Mensajes del cliente te llegarán directamente."`
- `Conversation.handoffActive = true` en DB (verificable SQL: `SELECT handoff_active FROM conversations WHERE ...`)

---

### Flujo 6.2.3 — Cliente responde con handoff activo (relay automático)

```bash
# Cliente responde (con handoffActive = true en su conversación)
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "<CHANNEL_PHONE_ID>" },
          "messages": [{
            "from": "<CUSTOMER_PHONE>",
            "id": "wamid.relay-test-003",
            "timestamp": "1708560200",
            "type": "text",
            "text": { "body": "Perfecto, estaré en casa después de las 2pm" }
          }]
        }
      }]
    }]
  }'
```

**Resultado esperado:**
- El bot NO responde al cliente (shouldSend = false)
- El merchant recibe: `"Cliente ORD-001 dice: Perfecto, estaré en casa después de las 2pm"`
- Flujos/LLM NO ejecutados (relay puro)
- MessageLog creado con `source = 'relay'`, `direction = IN`

---

### Flujo 6.2.4 — Comando `cerrar handoff`

```bash
# Merchant desactiva el handoff
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "<CHANNEL_PHONE_ID>" },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.relay-test-004",
            "timestamp": "1708560300",
            "type": "text",
            "text": { "body": "cerrar handoff" }
          }]
        }
      }]
    }]
  }'
```

**Resultado esperado:**
- Merchant recibe: `"✅ Handoff cerrado. El bot retomará conversación con el cliente."`
- `Conversation.handoffActive = false` en DB

---

### Flujo 6.2.5 — Error: pedido no encontrado

```bash
# msg con orderCode inexistente
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "<CHANNEL_PHONE_ID>" },
          "messages": [{
            "from": "<MERCHANT_WHATSAPP_NUMBER>",
            "id": "wamid.relay-test-005",
            "timestamp": "1708560400",
            "type": "text",
            "text": { "body": "msg ORD-NOEXISTE hola" }
          }]
        }
      }]
    }]
  }'
```

**Resultado esperado:**
- Merchant recibe: `"❌ Pedido ORD-NOEXISTE no encontrado"`

---

### Verificar MessageLog relay en DB

```bash
# Verificar que mensajes relay tienen source = 'relay'
psql $DATABASE_URL -c "SELECT id, direction, source, text FROM message_logs WHERE source = 'relay' ORDER BY created_at DESC LIMIT 5;"
```

### Verificar handoffActive en DB

```bash
# Verificar estado handoffActive por merchant
psql $DATABASE_URL -c "SELECT id, type, status, handoff_active FROM conversations WHERE merchant_id = '<MERCHANT_ID>' ORDER BY updated_at DESC LIMIT 5;"
```

### Acceptance Criteria (PR-05.2)

| AC | Criterio | Evidencia |
|----|----------|-----------|
| AC-01 | Migración `pr_05_2_message_relay` crea campos `Conversation.handoffActive` y `MessageLog.source` | `prisma/migrations/20260225145748_pr_05_2_message_relay/migration.sql` |
| AC-02 | Parser reconoce `msg`, `handoff`, `cerrar handoff` | `merchant-command-parser.service.spec.ts` — suite `AC-02 (PR-05.2)` — 8 tests |
| AC-03 | `MessageRelayService` implementa todos los métodos | `message-relay.service.spec.ts` — 17 tests |
| AC-04 | Comando `msg` envía al cliente formateado | e2e `message-relay.e2e-spec.ts` — `'AC-04: merchant sends msg...'` |
| AC-05 | Comando `handoff` activa `handoffActive = true` | e2e `message-relay.e2e-spec.ts` — `'AC-05: merchant sends handoff...'` |
| AC-06 | Comando `cerrar handoff` desactiva `handoffActive = false` | e2e `message-relay.e2e-spec.ts` — `'AC-06: cerrar handoff...'` |
| AC-07 | Orchestrator con `handoffActive = true` → relay, NO flows/LLM | `conversation.orchestrator.spec.ts` — suite `PR-05.2 AC-07` — 2 tests |
| AC-08 | Cliente recibe `"Mensaje de {merchant}: {texto}"` | e2e — OutboxMessage payload verificado |
| AC-09 | Merchant recibe `"Cliente {orderCode} dice: {texto}"` | e2e — OutboxMessage payload verificado |
| AC-10 | Mensajes relay con `source = 'relay'` en MessageLog | e2e — `'AC-10: relay message logged...'` |
| AC-11 | Unit tests pasan: parser + relay service | 725 unit tests totales pasan |
| AC-12 | E2E tests pasan (9 scenarios ≥ 8) | `pnpm test:e2e message-relay.e2e-spec` — 9 passed |
| AC-13 | Flujo 6.2 en BACKEND-EXECUTION-GUIDE.md con 5+ cURL | Sección "Flujo 6.2" con 5 ejemplos cURL |

---

## Flujo 7: Checkout Conversacional (PR-05)

Flujo completo: el cliente inicia el checkout desde WhatsApp enviando "quiero pagar". El bot captura nombre, dirección y método de pago, crea la orden y notifica al merchant.

**Prerrequisitos:**
- Merchant + Channel (WHATSAPP) creados
- `MerchantConfig.paymentMethods` configurado (ver Flujo 5.5)
- Cliente con carrito activo con ≥ 1 artículo (ver Flujo 6)

**Variables de entorno necesarias:**
```bash
PHONE_NUMBER_ID=<externalId del Canal>  # ej: 123456789012345
CUSTOMER_PHONE=+573001234567
```

### Paso 1 — Cliente envía "quiero pagar" → Bot pide nombre

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "'$PHONE_NUMBER_ID'" },
          "messages": [{
            "from": "'$CUSTOMER_PHONE'",
            "id": "chk-msg-001",
            "timestamp": "1700000001",
            "type": "text",
            "text": { "body": "quiero pagar" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Respuesta esperada:** `{ "received": true }` — el bot envía por outbox: _"¿Cuál es tu nombre completo para la entrega?"_

**Estado en DB:**
```sql
SELECT metadata->'checkout' FROM conversations
WHERE customer_id = (SELECT id FROM customers WHERE phone = '+573001234567')
ORDER BY updated_at DESC LIMIT 1;
-- { "step": "ASK_NAME", "cartId": "...", "merchantId": "...", "customerId": "..." }
```

---

### Paso 2 — Cliente envía su nombre → Bot pide dirección

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "'$PHONE_NUMBER_ID'" },
          "messages": [{
            "from": "'$CUSTOMER_PHONE'",
            "id": "chk-msg-002",
            "timestamp": "1700000002",
            "type": "text",
            "text": { "body": "María García López" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Respuesta esperada:** _"¿Cuál es tu dirección de entrega completa?"_

**Estado en DB:** `step: "ASK_ADDRESS"`, `customerName: "María García López"`

---

### Paso 3 — Cliente envía su dirección → Bot muestra métodos de pago

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "'$PHONE_NUMBER_ID'" },
          "messages": [{
            "from": "'$CUSTOMER_PHONE'",
            "id": "chk-msg-003",
            "timestamp": "1700000003",
            "type": "text",
            "text": { "body": "Calle 82 #15-23 Apto 401, Bogotá" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Respuesta esperada (AC-08):**
```
💳 Selecciona tu método de pago:
1. Contraentrega
2. Transferencia bancaria
```

**Estado en DB:** `step: "SELECT_PAYMENT"`, `shippingAddress: "Calle 82 #15-23 Apto 401, Bogotá"`

---

### Paso 4 — Cliente selecciona método de pago → Bot muestra resumen de confirmación

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "'$PHONE_NUMBER_ID'" },
          "messages": [{
            "from": "'$CUSTOMER_PHONE'",
            "id": "chk-msg-004",
            "timestamp": "1700000004",
            "type": "text",
            "text": { "body": "1" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Respuesta esperada:**
```
📋 Resumen de tu pedido:

👤 Nombre: María García López
📍 Dirección: Calle 82 #15-23 Apto 401, Bogotá
💳 Pago: Contraentrega

🛍️ Productos:
  • Camiseta M x2 — $60.000 c/u
  • Camiseta L x1 — $60.000 c/u

💰 Total: $180.000

Escribe *confirmar* para finalizar tu pedido ✅
```

**Estado en DB:** `step: "CONFIRM"`, `paymentMethod: "cod"`, `paymentLabel: "Contraentrega"`

---

### Paso 5 — Cliente confirma → Orden creada + notificación al merchant

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "'$PHONE_NUMBER_ID'" },
          "messages": [{
            "from": "'$CUSTOMER_PHONE'",
            "id": "chk-msg-005",
            "timestamp": "1700000005",
            "type": "text",
            "text": { "body": "confirmar" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Verificar orden creada (AC-15):**
```sql
SELECT o.order_code, o.status, o.total_amount, o.customer_name, o.shipping_address, o.payment_method
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE c.phone = '+573001234567'
ORDER BY o.created_at DESC LIMIT 1;
-- order_code | status          | total_amount | customer_name      | shipping_address              | payment_method
-- ORD-001    | pending_payment | 180000.00    | María García López | Calle 82 #15-23 Apto 401 ...  | cod
```

**Verificar items con snapshot (AC-09):**
```sql
SELECT oi.quantity, oi.unit_price, oi.snapshot_name
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.order_code = 'ORD-001';
```

**Verificar carrito completado (AC-10):**
```sql
SELECT status FROM carts
WHERE customer_id = (SELECT id FROM customers WHERE phone = '+573001234567')
  AND status = 'completed';
```

**Verificar notificación merchant en outbox (AC-11):**
```sql
SELECT dedupe_key, status, payload
FROM outbox_messages
WHERE dedupe_key LIKE 'new-order-ORD-001-%'
ORDER BY created_at DESC LIMIT 1;
```

---

### Flujo alternativo — Carrito vacío (AC-13)

Si el cliente envía "quiero pagar" sin carrito activo:

```bash
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "'$PHONE_NUMBER_ID'" },
          "messages": [{
            "from": "+573000000099",
            "id": "chk-empty-001",
            "timestamp": "1700000006",
            "type": "text",
            "text": { "body": "quiero pagar" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Respuesta esperada:** _"Tu carrito está vacío. Primero agrega productos."_ (sin crear orden)

---

### Acceptance Criteria (PR-05)

**Implementados:**
- ✅ **AC-03**: `orderCode` secuencial por merchant con prefijo (`ORD-001`, `ORD-002`…)
- ✅ **AC-04**: No inicia checkout si carrito vacío → mensaje de error
- ✅ **AC-05**: Estado checkout persiste en `Conversation.metadata.checkout` (JSON)
- ✅ **AC-06**: Estado se recupera entre mensajes (multi-step continuity)
- ✅ **AC-07**: Flujo en orden: `ASK_NAME → ASK_ADDRESS → SELECT_PAYMENT → CONFIRM → COMPLETED`
- ✅ **AC-08**: Métodos de pago numerados desde `MerchantConfig.paymentMethods`
- ✅ **AC-09**: `OrderItem` con snapshot `unitPrice` + `snapshotName` del momento de compra
- ✅ **AC-10**: `Cart.status = completed` tras crear orden (transaccional)
- ✅ **AC-11**: Notificación merchant encolada en outbox con `dedupeKey`
- ✅ **AC-12**: Intent `CHECKOUT` con 10 keywords (`quiero pagar`, `checkout`, `finalizar`…)
- ✅ **AC-13**: Carrito vacío → `startCheckout` lanza error → flujo termina con mensaje
- ✅ **AC-15**: Flujo e2e completo probado en `checkout-flow.e2e-spec.ts`
- ✅ **AC-16**: Esta documentación (Flujo 7 en BACKEND-EXECUTION-GUIDE.md)

**Coverage:** ~33 tests passing
- 15 service tests (checkout.service.spec.ts)
- 5 service tests (merchant-notification.service.spec.ts)
- 13 flow tests (checkout.flow.spec.ts)
- E2E tests (checkout-flow.e2e-spec.ts)
- Extended: keyword-configs.spec.ts, intent-router.service.spec.ts

---

## Troubleshooting

### Error: "Channel not found"

El `phone_number_id` del mensaje inbound no tiene Channel asociado.

**Solución:** Completar onboarding o crear Channel manualmente:

```sql
INSERT INTO channels (id, merchant_id, type, external_id, display_name, credentials, is_active, status)
VALUES (
  'clxxx',
  '<merchant-id>',
  'WHATSAPP',
  '<phone-number-id>',
  'Mi WhatsApp',
  '{"accessToken": "...", "phoneNumberId": "..."}',
  true,
  'connected'
);
```

### Error: "No session cookie" (401)

No hay cookie `session_id` válida.

**Solución:** Completar login OIDC primero.

### Error: "LLM generation failed"

Groq API no responde.

**Solución:** Verificar `GROQ_API_KEY` y que `LLM_ENABLED=true`. El sistema usará fallback templated automáticamente.

### Error: "Webhook signature invalid" (401)

La firma `X-Hub-Signature-256` no coincide.

**Modo dev:** Si `WHATSAPP_APP_SECRET` no está configurado, se permite el request con warning.

---

## Flujo 7: Payments (PR-06)

Confirmación de pagos via webhook idempotente o comando manual `PAGADO`.

### Setup: Variables de entorno

```bash
# En .env
PAYMENT_WEBHOOK_SECRET="your-payment-webhook-secret"
PAYMENT_WEBHOOK_HEADER="X-Payment-Signature"
```

### 7.1 — Configurar HMAC signature (helper bash)

```bash
# Helper para generar signature HMAC SHA-256
gen_sig() {
  local BODY="$1"
  local SECRET="$2"
  echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256="$2}'
}

SECRET="your-payment-webhook-secret"
MERCHANT_API_KEY="<your-merchant-api-key>"   # Obtén con GET /merchants/me
```

### 7.2 — Confirmar pago aprobado (webhook gateway)

```bash
BODY='{"payment_intent_id":"pi_abc123","order_code":"ORD-001","amount":120000,"status":"approved","method":"transfer","timestamp":"2026-02-24T10:30:00Z"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-payment-webhook-secret" | awk '{print "sha256="$2}')

curl -X POST http://localhost:3000/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Api-Key: $MERCHANT_API_KEY" \
  -H "X-Payment-Signature: $SIG" \
  -d "$BODY"
```

**Respuesta exitosa (200 OK):**
```json
{
  "success": true,
  "payment_id": "clxxxxx",
  "order_code": "ORD-001",
  "status": "confirmed"
}
```

### 7.3 — Webhook duplicado (idempotente — AC-08)

```bash
# Mismo payload, misma signature → 200 OK sin duplicar
curl -X POST http://localhost:3000/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Api-Key: $MERCHANT_API_KEY" \
  -H "X-Payment-Signature: $SIG" \
  -d "$BODY"
```

**Respuesta (200 OK — ya procesado):**
```json
{
  "success": true,
  "payment_id": "clxxxxx",
  "order_code": "ORD-001",
  "status": "confirmed",
  "message": "Payment already processed"
}
```

### 7.4 — Pago rechazado (status: rejected — AC-07)

```bash
BODY_REJ='{"payment_intent_id":"pi_rejected_001","order_code":"ORD-001","amount":120000,"status":"rejected","method":"transfer","timestamp":"2026-02-24T10:30:00Z"}'
SIG_REJ=$(echo -n "$BODY_REJ" | openssl dgst -sha256 -hmac "your-payment-webhook-secret" | awk '{print "sha256="$2}')

curl -X POST http://localhost:3000/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Api-Key: $MERCHANT_API_KEY" \
  -H "X-Payment-Signature: $SIG_REJ" \
  -d "$BODY_REJ"
```

**Respuesta (200 OK — registrado como fallido):**
```json
{
  "success": true,
  "payment_id": "clyyyyy",
  "order_code": "ORD-001",
  "status": "failed"
}
```

### 7.5 — Signature inválida (AC-05)

```bash
curl -X POST http://localhost:3000/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Api-Key: $MERCHANT_API_KEY" \
  -H "X-Payment-Signature: sha256=invalidsignature" \
  -d "$BODY"
```

**Respuesta (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Invalid signature"
}
```

### 7.6 — Sin API key (401)

```bash
curl -X POST http://localhost:3000/webhooks/payments \
  -H "Content-Type: application/json" \
  -d "$BODY"
# → 401 Unauthorized: Missing X-Merchant-Api-Key header
```

### 7.7 — Fallback conversacional PAGADO (WhatsApp)

El cliente puede confirmar un pago manual enviando mensajes:

```
Cliente: "Ya pagué"
Bot: "¿Para qué pedido realizaste el pago? Responde con el código (ej: ORD-001)."
Cliente: "ORD-001"
Bot: "Confirma que realizaste el pago de $120,000 COP para el pedido ORD-001.
      Responde *confirmar* para registrar el pago o *cancelar* para cancelar."
Cliente: "confirmar"
Bot: "✅ Pago registrado para el pedido ORD-001. El vendedor verificará tu transferencia pronto."
```

**Auth:** Este flujo va por el webhook WhatsApp normal (integridad via `X-Hub-Signature-256`).

### 7.8 — Errores comunes

#### Error: "Order not found" (404)
El `order_code` en el payload no existe para ese merchant.
**Solución:** Verificar `order_code` correcto. Se genera en checkout (`ORD-XXX`).

#### Error: "Invalid signature" (401)
HMAC no coincide.
**Solución:** Verificar `PAYMENT_WEBHOOK_SECRET` y que el body sea idéntico al firmado (sin reformateo).

#### Error: "Missing X-Merchant-Api-Key" (401)
Falta el header de autenticación del merchant.
**Solución:** Obtener API key del merchant via dashboard y enviarlo en `X-Merchant-Api-Key`.

---

## Flujo 8: Post-venta (PR-07)

Estado de pedido y tickets simples via WhatsApp conversacional.

### Flujo 8.1 — Consulta de estado de pedido

El cliente pregunta por el estado de su pedido. El bot pide el código de orden (o lo detecta en el mensaje) y responde con el estado actual.

**Conversación de ejemplo:**

```
Cliente:  "estado de mi pedido"
Bot:      "¡Hola! Ingresa el código de tu pedido (ej: ORD-1234) 📦"
Cliente:  "ORD-1234"
Bot:      "Tu pedido #ORD-1234 está: ✅ Confirmado y siendo preparado. ¡Te avisamos cuando despache! 🚚"
```

**Flujo de estados disponibles:**

| Estado DB | Mensaje al cliente |
|---|---|
| `PENDING_PAYMENT` | Pago pendiente de confirmación |
| `CONFIRMED` | Confirmado, siendo preparado |
| `PAID` | Pago confirmado, siendo preparado |
| `SHIPPED` | En camino (incluye tracking si disponible) |
| `DELIVERED` | Entregado 🎉 |
| `CANCELLED` | Cancelado |

**Simular via WhatsApp webhook (cURL):**

```bash
# Configurar variables
WEBHOOK_URL="http://localhost:3000/webhooks/whatsapp"
BUSINESS_PHONE_ID="your-phone-number-id"
APP_SECRET="your-app-secret"
CUSTOMER_PHONE="5491112345678"
MERCHANT_PHONE_ID="18094197225"
TIMESTAMP=$(date +%s)

# Generar firma HMAC
BODY='{"object":"whatsapp_business_account","entry":[{"id":"WA_BUSINESS_ACCOUNT_ID","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15550000001","phone_number_id":"'"$MERCHANT_PHONE_ID"'"},"contacts":[{"profile":{"name":"Test Customer"},"wa_id":"'"$CUSTOMER_PHONE"'"}],"messages":[{"from":"'"$CUSTOMER_PHONE"'","id":"wamid.status001","type":"text","timestamp":"'"$TIMESTAMP"'","text":{"body":"estado de mi pedido"}}]},"field":"messages"}]}]}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | sed 's/^.* //')

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$BODY"
# Respuesta: {"status":"ok"}
# El bot enviará: "¡Hola! Ingresa el código de tu pedido..."
```

### Flujo 8.2 — Creación de ticket de soporte

El cliente reporta un problema. El bot detecta el intent y crea un ticket, con notificación al merchant vía OutboxMessage.

**Tipos de ticket soportados:**

| Tipo | Keywords de detección | Label |
|---|---|---|
| `missing` | falta, no llegó, incompleto, faltante | Producto faltante |
| `damaged` | dañado, roto, defectuoso, no funciona | Producto dañado |
| `delay` | demora, tardanza, tarde, lento | Demora en entrega |
| `other` | problema, reclamo (default) | Otro |

**Conversación de ejemplo:**

```
Cliente:  "tengo un problema con mi pedido"
Bot:      "Lamentamos los inconvenientes 😔 Ingresa el código de tu pedido para abrir un ticket"
Cliente:  "ORD-5678"
Bot:      "¿Qué tipo de problema tienes?\n1️⃣ Producto faltante\n2️⃣ Producto dañado\n3️⃣ Demora en entrega\n4️⃣ Otro"
Cliente:  "2"
Bot:      "Descríbenos el problema brevemente:"
Cliente:  "El producto llegó roto"
Bot:      "✅ Ticket creado para tu pedido ORD-5678. Nuestro equipo te contactará pronto."
```

**Simular apertura de ticket:**

```bash
BODY='{"object":"whatsapp_business_account","entry":[{"id":"WA_BUSINESS_ACCOUNT_ID","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15550000001","phone_number_id":"'"$MERCHANT_PHONE_ID"'"},"contacts":[{"profile":{"name":"Test Customer"},"wa_id":"'"$CUSTOMER_PHONE"'"}],"messages":[{"from":"'"$CUSTOMER_PHONE"'","id":"wamid.ticket001","type":"text","timestamp":"'"$TIMESTAMP"'","text":{"body":"tengo un problema con mi pedido"}}]},"field":"messages"}]}]}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | sed 's/^.* //')

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$BODY"
```

### Flujo 8.3 — Verificar ticket creado (DB)

```bash
# En psql (o via prisma studio)
docker exec -it closy-bot-postgres-1 psql -U closy -d closy_dev \
  -c "SELECT id, order_id, type, status, description, created_at FROM tickets ORDER BY created_at DESC LIMIT 5;"
```

### Acceptance Criteria (PR-07)

- ✅ **AC-01**: Migración crea tabla `tickets` con enums `TicketType` y `TicketStatus`
- ✅ **AC-02**: `PostSaleService.getOrderStatus()` retorna último pedido del cliente con status
- ✅ **AC-03**: `PostSaleService.getOrderStatus(orderCode)` busca por orderCode específico
- ✅ **AC-04**: `PostSaleService.createTicket()` crea Ticket con status `open`
- ✅ **AC-05**: `PostSaleFlow.handleOrderStatus()` responde con template según `order.status`
- ✅ **AC-06**: Cliente sin pedidos recibe mensaje "No encontré pedidos tuyos"
- ✅ **AC-07**: Cliente con pedido `shipped` recibe template con tracking info
- ✅ **AC-08**: `PostSaleFlow.handleCreateTicket()` clasifica tipo por keywords
- ✅ **AC-09**: Ticket creado notifica al merchant vía `MerchantNotificationService`
- ✅ **AC-10**: IntentRouter clasifica `ORDER_STATUS` con high confidence | `intent-router.service.spec.ts`
- ✅ **AC-11**: IntentRouter clasifica `CREATE_TICKET` con high confidence | `intent-router.service.spec.ts`
- ✅ **AC-12**: `PlaybookMessages` tiene todos los campos de post-venta
- ✅ **AC-13**: Industry presets (ropa/belleza/minimarket) con templates específicos
- ✅ **AC-14**: Merchant recibe notificación WhatsApp al crear ticket | `post-sale-flow.e2e-spec.ts`
- ✅ **AC-15**: E2E: consulta estado → respuesta template-first sin LLM | `post-sale-flow.e2e-spec.ts`
- ✅ **AC-16**: E2E: cliente reporta problema → ticket creado + merchant notificado | `post-sale-flow.e2e-spec.ts`

---

## PR-08 — Handoff Humano (✅ Implementado)

### Flujo — Solicitud explícita de handoff

```bash
# Cliente envía keyword → intent HANDOFF → Handoff creado + merchant notificado
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: dev-skip" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "entry-1",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "display_phone_number": "15550000001", "phone_number_id": "<CHANNEL_PHONE_ID>" },
          "messages": [{
            "from": "+573001234567",
            "id": "msg-handoff-001",
            "timestamp": "1700000001",
            "type": "text",
            "text": { "body": "quiero hablar con alguien" }
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Resultado esperado:**
- HTTP 200
- `Conversation.handoffActive = true` en DB
- `Handoff` creado con `reason=user_request` y `status=pending`
- `OutboxMessage` encolado para merchant con `dedupeKey=handoff-{conversationId}`

```bash
# Verificar en DB
psql $DATABASE_URL -c "SELECT reason, status, summary_json FROM handoffs ORDER BY created_at DESC LIMIT 1;"
psql $DATABASE_URL -c "SELECT handoff_active FROM conversations WHERE id = '<conversationId>';"
```

### Flujo — Auto-escalation (3 mensajes UNKNOWN)

```bash
# Enviar 3 mensajes gibberish consecutivos desde mismo número
for body in "zzzzxyz" "blargfoo" "qwerasdf"; do
  curl -s -X POST http://localhost:3000/webhooks/whatsapp \
    -H "Content-Type: application/json" \
    -H "x-hub-signature-256: dev-skip" \
    -d "{...payload con body=$body...}"
done
# Después del 3er mensaje: Handoff creado con reason=auto_escalation
```

### Variables de entorno (PR-08)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `LLM_SUMMARY_ENABLED` | `false` | Si `true`, enriquece summary con highlights LLM (fallback determinístico si LLM falla) |

### Evidence por AC

- ✅ **AC-01**: Migración `20260225154330_pr_08_handoff` crea tabla `handoffs` | `prisma migrate status`
- ✅ **AC-02**: `detectHandoff()` retorna true para intent HANDOFF | `handoff.service.spec.ts`
- ✅ **AC-03**: `detectHandoff()` retorna true cuando counter UNKNOWN >= 3 | `handoff.service.spec.ts`
- ✅ **AC-04**: `createHandoff()` crea registro + activa handoffActive + notifica merchant | `handoff.service.spec.ts` + `handoff-flow.e2e-spec.ts`
- ✅ **AC-05**: IntentRouter reconoce 'quiero hablar con alguien' → HANDOFF HIGH | `intent-router.service.spec.ts`
- ✅ **AC-06**: Orchestrator trackea UNKNOWN loops → auto-escalation a 3 | `handoff-flow.e2e-spec.ts`
- ✅ **AC-07**: Summary determinístico incluye intent, cartSnapshot, step, customerInfo, últimos 3 mensajes | `handoff.service.spec.ts` + `handoff-flow.e2e-spec.ts`
- ✅ **AC-08**: Con LLM_SUMMARY_ENABLED=true → summary tiene conversationHighlights | `handoff.service.spec.ts`
- ✅ **AC-09**: OutboxMessage para merchant con template correcto | `handoff-flow.e2e-spec.ts`
- ✅ **AC-10**: conversation.handoffActive = true persistido en DB | `handoff-flow.e2e-spec.ts`
- ✅ **AC-11**: `HandoffFlow.handle()` responde mensaje correcto según reason | `handoff.flow.spec.ts`
- ✅ **AC-12**: PlaybookConfig interface extendida con handoffMessages + DTO validado | `playbook-config.interface.spec.ts`
- ✅ **AC-13**: Industry presets (ropa/belleza/minimarket/generic) con handoffMessages defaults | archivos preset actualizados
- ✅ **AC-14**: Handoff idempotente — no crea duplicado si ya existe pending/active | `handoff-flow.e2e-spec.ts`
- ✅ **AC-15**: LLM summary fallback — si LLM falla, usa determinístico sin crash | `handoff.service.spec.ts`

---

## PR-OB-01 — Onboarding Wizard API (✅ Implementado)

**Auth**: Session Cookie (`session_id`) — igual que dashboard endpoints  
**Base URL**: `http://localhost:3000`

### GET /onboarding/progress — Progreso del onboarding

```bash
# Ver estado actual de onboarding para el merchant autenticado
curl -s -X GET http://localhost:3000/onboarding/progress \
  -H "Cookie: session_id=<session_cookie>" | jq
```

**Respuesta esperada (200):**
```json
{
  "completedSteps": ["profile"],
  "pendingSteps": ["channel", "catalog", "config", "test"],
  "percentage": 20,
  "nextStep": "channel"
}
```

**Pasos posibles:** `profile` (nombre + industria configurados), `channel` (≥1 canal activo), `catalog` (≥1 producto), `config` (≥1 método de pago), `test` (≥1 mensaje entrante recibido)

---

### POST /onboarding/apply-preset — Aplicar plantilla de industria

```bash
# Aplicar preset ropa (también soporta: belleza, minimarket)
curl -s -X POST http://localhost:3000/onboarding/apply-preset \
  -H "Cookie: session_id=<session_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"industry":"ropa"}' | jq
```

**Cuerpo requerido:**
| Campo | Tipo | Valores válidos |
|-------|------|----------------|
| `industry` | string | `ropa`, `belleza`, `minimarket` |

**Respuesta esperada (200):**
```json
{
  "completedSteps": ["profile", "config"],
  "pendingSteps": ["channel", "catalog", "test"],
  "percentage": 40,
  "nextStep": "channel"
}
```

**Comportamiento:**
- Si el merchant **no tiene** `playbookConfig` previo: aplica todos los defaults de la industria (mensajes, métodos de pago, saludos, etc.)
- Si ya **tiene** `playbookConfig`: solo actualiza la clave `industry` (preserva customizaciones)
- Siempre retorna el progreso actualizado

---

### POST /onboarding/activate — Activar merchant

```bash
# Activar merchant (cambia status de 'onboarding' a 'active')
curl -s -X POST http://localhost:3000/onboarding/activate \
  -H "Cookie: session_id=<session_cookie>" | jq
```

**Respuesta exitosa (200):**
```json
{
  "activated": true,
  "status": "active"
}
```

**Respuesta con requisitos faltantes (400):**
```json
{
  "error": "Missing requirements",
  "details": ["channel", "catalog"]
}
```

**Requisitos mínimos para activar:** `channel`, `catalog`, `config`  
**Comportamiento:** Idempotente — si el merchant ya está `active`, retorna `{ activated: true, status: "active" }` sin efecto secundario.

---

### Errores comunes

| Código | Descripción | Solución |
|--------|-------------|----------|
| `401` | Sin sesión o sesión expirada | Autenticar con `POST /auth/session` |
| `400` | `industry` inválida en `apply-preset` | Usar: `ropa`, `belleza` o `minimarket` |
| `400` | Requisitos faltantes en `activate` | Ver campos `error` y `details` en la respuesta |

---

### Variables de entorno (PR-OB-01)

No requiere variables de entorno adicionales. Usa la misma configuración de DB y sesión que los demás módulos.

---

### Evidence por AC

- ✅ **AC-01**: `GET /onboarding/progress` retorna `completedSteps[]` calculados dinámicamente | `onboarding.service.spec.ts`
- ✅ **AC-02**: `percentage` calculado correctamente (completedSteps/totalSteps * 100) | `onboarding.service.spec.ts`
- ✅ **AC-03**: `OnboardingService` con métodos `getProgress`, `applyPreset`, `activate` | `onboarding.service.spec.ts`
- ✅ **AC-04**: `POST /onboarding/apply-preset` con `industry` válida aplica defaults de industria | `onboarding.service.spec.ts`
- ✅ **AC-05**: `apply-preset` con config existente preserva customizaciones (solo actualiza `industry`) | `onboarding.service.spec.ts`
- ✅ **AC-06**: `POST /onboarding/activate` con requisitos completos → `status: active` + `activated: true` | `onboarding.service.spec.ts`
- ✅ **AC-07**: `activate` con requisitos faltantes → 400 + `{ error, details[] }` | `onboarding.service.spec.ts`
- ✅ **AC-08**: `Merchant.status` enum (`onboarding|active|paused`) + migración `20260225210000_pr_ob_01_add_merchant_status` | `prisma migrate status`
- ✅ **AC-09**: `ConversationOrchestrator` bloquea mensajes de clientes si `merchant.status !== 'active'` | `conversation.orchestrator.spec.ts`
- ✅ **AC-10**: Unit tests para `OnboardingService` (25 tests) | `onboarding.service.spec.ts`
- ✅ **AC-11**: Unit tests para `OnboardingController` (7 tests) | `onboarding.controller.spec.ts`
- ✅ **AC-12**: E2E tests cubren full flow: auth, apply-preset, activate, idempotencia | `onboarding.e2e-spec.ts`

---

## Feature Flags (PR-MVP-01)

### Descripción

Infraestructura de feature flags con kill-switch global (`FEATURES_MODE`) para separar code paths MVP de B2.
En modo `mvp` (producción), **todos los flags B2 retornan `false`**, sin importar config granular.

### Variables de entorno

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `FEATURES_MODE` | `mvp\|dev\|full` | `mvp` | Kill-switch global |
| `MULTI_CHANNEL_ENABLED` | boolean | `false` | Permite más de 1 canal por merchant (B2) |
| `INSTAGRAM_ENABLED` | boolean | `false` | Habilita onboarding Instagram (B2) |
| `PLAYBOOK_EDITOR_ENABLED` | boolean | `false` | Editor avanzado de playbook (B2) |
| `INDUSTRIES_ENABLED` | boolean | `false` | Selector de verticales ropa/belleza/minimarket (B2) |

### Comportamiento del kill-switch

```
FEATURES_MODE=mvp  → todos los flags B2 = false (override forzado, seguro para prod)
FEATURES_MODE=dev  → flags respetan valores individuales de env vars
FEATURES_MODE=full → flags respetan valores individuales (futuro post-B2)
```

### Gating server-side: bloquear segundo canal (AC-04, AC-05)

En modo MVP, intentar crear un segundo canal WhatsApp retorna `403 Forbidden`.

```bash
# Escenario: merchant ya tiene 1 canal, intenta crear otro
# FEATURES_MODE=mvp (default)
curl -X POST http://localhost:3000/onboarding/whatsapp/callback \
  -H "Cookie: session=<session_token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "abc123", "state": "xyz"}'

# Respuesta esperada cuando merchant ya tiene 1 canal:
# HTTP 403 Forbidden
# {
#   "statusCode": 403,
#   "message": "Multi-channel requires enterprise plan",
#   "error": "Forbidden"
# }
```

```bash
# Escenario: modo dev con flag habilitado → permite segundo canal
# FEATURES_MODE=dev + MULTI_CHANNEL_ENABLED=true
curl -X POST http://localhost:3000/onboarding/whatsapp/callback \
  -H "Cookie: session=<session_token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "abc123", "state": "xyz"}'
# Respuesta esperada: 200 OK con channelId
```

### Frontend hook (AC-06)

```typescript
// apps/dashboard/src/hooks/use-features.ts
import { useFeatures } from '@/hooks/use-features';

function ChannelSettings() {
  const { isMultiChannelEnabled } = useFeatures();

  return (
    <div>
      {/* Solo visible en modo dev/full con flag habilitado */}
      {isMultiChannelEnabled && <ConnectAnotherChannelButton />}
    </div>
  );
}
```

### Evidence por AC

- ✅ **AC-01**: `FeatureFlagsService` creado con inyección de `ConfigService` | `feature-flags.service.spec.ts`
- ✅ **AC-02**: Kill-switch: `FEATURES_MODE=mvp` → todos los flags B2 = false | `describe('AC-02: Kill-switch mode=mvp...')`
- ✅ **AC-03**: `env.validation.ts` validado con Joi para `FEATURES_MODE`, `MULTI_CHANNEL_ENABLED`, etc. | `env.validation.ts`
- ✅ **AC-04**: Gating en creación de canal: max 1 en MVP → 403 | `meta-oauth.service.ts`
- ✅ **AC-05**: Merchant con 1 canal existente no puede crear otro en MVP | `meta-oauth.service.spec.ts` integration
- ✅ **AC-06**: Hook `useFeatures()` retorna flags correctos según env vars | `apps/dashboard/src/hooks/use-features.ts`
- ✅ **AC-07**: `.env.example` actualizado en API y Dashboard con defaults MVP | `apps/api/.env.example`, `apps/dashboard/.env.example`
- ✅ **AC-08**: Tests cubren modo `mvp`, `dev`, y flags individuales | `pnpm test` pasa
- ✅ **AC-09**: Documentación en `BACKEND-EXECUTION-GUIDE.md` con ejemplos cURL | esta sección

---

## Channels UI — PR-FE-03 (✅ Implementado)

Página `/dashboard/channels` con lista de canales, health panel, retry webhook, y feature flag gating para multi-channel.

### Setup previo

```bash
# 1. Backend running con PR-14 + PR-16 mergeados
pnpm dev:api

# 2. Dashboard running
pnpm dev:dashboard
# → http://localhost:3001

# 3. Merchant con sesión activa (cookie session_id)
# Login previo en /login con Google/Microsoft
```

### Testing manual — Canales UI

#### T1: Lista de canales (AC-01, AC-02)

```bash
# Navegar a http://localhost:3001/dashboard/channels
# → Debe mostrar lista de ChannelCards

# Verificar que el request incluye cookie (AC-02)
# DevTools → Network → GET /channels → Headers → Cookie: session_id=...
```

#### T2: Health panel expandible (AC-04, AC-05)

```bash
# 1. Click en cualquier ChannelCard
# → Panel se expande con datos de GET /channels/:id/health
# → Muestra: webhook status ✅/❌, errorCount, recentErrors, recommendation
```

#### T3: Retry Webhook — éxito (AC-06)

```bash
# Prerequisito: canal con status=error o webhookSubscribed=false
# 1. Expandir health panel del canal
# 2. Click "Retry Webhook"
# → Spinner durante la petición
# → Toast success: "Webhook reconectado exitosamente"
# → Badge del canal actualiza a "Conectado"
```

#### T4: Retry Webhook — rate limit 429 (AC-07)

```bash
# Hacer 6 requests retry en <1 minuto
# → 6to request muestra toast: "Demasiados intentos. Espera 60 segundos."
# → Botón "Retry Webhook" se deshabilita con countdown visible
```

#### T5: Empty state (AC-08)

```bash
# Sin canales en la DB del merchant:
# → Página muestra EmptyChannelsState
# → Icono + "No tienes canales conectados"
# → Botón CTA "Conectar WhatsApp" → redirect /onboarding?flow=add_channel
```

#### T6: Feature flag multi-channel (AC-09)

```bash
# apps/dashboard/.env.local (modo MVP default):
NEXT_PUBLIC_FEATURES_MODE=mvp

# → Botón "Conectar otro canal" NO visible
# Equivalente: NEXT_PUBLIC_FEATURES_MODE=dev + NEXT_PUBLIC_MULTI_CHANNEL_ENABLED=true
# → Botón "Conectar otro canal" SÍ visible
```

#### T7: Loading skeleton (AC-11)

```bash
# Throttle red en DevTools → "Slow 3G"
# Navegar a /dashboard/channels
# → Skeletons animados visibles durante la carga (no flash de pantalla vacía)
```

#### T8: Error 403 ownership (AC-10)

```bash
# Modificar URL manualmente a un canal de otro merchant
# GET /channels/ch_otro_merchant/health → 403
# → Toast: "No tienes permiso para ver este canal"
```

#### T9: Mobile responsive

```bash
# DevTools → Toggle device toolbar → iPhone SE (375px)
# → Cards en columna, sin scroll horizontal
# → Botones y badges visibles y toucheable
```

### cURL — Endpoints consumidos por la UI

```bash
# GET /channels (con cookie de sesión)
curl -X GET http://localhost:3000/channels \
  -H "Cookie: session_id=<tu-session-id>"

# GET /channels/:id/health
curl -X GET http://localhost:3000/channels/<channel-id>/health \
  -H "Cookie: session_id=<tu-session-id>"

# POST /channels/:id/retry-webhook
curl -X POST http://localhost:3000/channels/<channel-id>/retry-webhook \
  -H "Cookie: session_id=<tu-session-id>"
```

### Evidence por AC

- ✅ **AC-01**: `channels/page.tsx` llama `useChannels()` → `GET /channels` | `use-channels.ts: queryFn`
- ✅ **AC-02**: `apiFetch` con `credentials: 'include'` envía cookie automáticamente | `lib/api.ts`
- ✅ **AC-03**: `ChannelCard` usa `Badge` con variant `success`/`destructive`/`warning` según status | `channel-card.tsx`
- ✅ **AC-04**: Click en card expande `ChannelHealthPanel` que llama `useChannelHealth(id)` | `channel-card.tsx`
- ✅ **AC-05**: `recommendation` mapeado a texto legible en `ChannelHealthPanel` | `channel-health-panel.tsx`
- ✅ **AC-06**: `RetryWebhookButton` usa `useMutation` + `isPending` spinner + toast success | `retry-webhook-button.tsx`
- ✅ **AC-07**: Error 429 → toast "Demasiados intentos..." + countdown 60s | `retry-webhook-button.tsx`
- ✅ **AC-08**: `channels.length === 0` → `EmptyChannelsState` con CTA | `channels/page.tsx`
- ✅ **AC-09**: `features.isMultiChannelEnabled` gatea botón "Conectar otro canal" | `channels/page.tsx`
- ✅ **AC-10**: Error 401 → redirect `/login`; Error 403 → banner "No tienes acceso" | `channels/page.tsx`
- ✅ **AC-11**: `isLoading` → `<ChannelCardSkeleton />` con `Skeleton` component | `channels/page.tsx`

---

## PR-FE-06: Orders API — Torre de Control

> **Auth**: Session Cookie (`closy_session`). Requiere estar autenticado como merchant.
> **Base URL**: `http://localhost:3000`

### GET /orders — Listar órdenes con filtros

```bash
curl -s "http://localhost:3000/orders" \\
  -H "Cookie: closy_session=<tu-session-cookie>" | jq .

curl -s "http://localhost:3000/orders?status=pending_payment&status=confirmed&dateFrom=2026-01-01&limit=20&offset=0" \\
  -H "Cookie: closy_session=<tu-session-cookie>" | jq .
```

Respuesta `200`: `{ orders: [...], total: N, limit: 20, offset: 0 }`

---

### GET /orders/pending-count — Badge sidebar

```bash
curl -s "http://localhost:3000/orders/pending-count" \\
  -H "Cookie: closy_session=<tu-session-cookie>" | jq .
```

Respuesta `200`: `{ "count": 5 }`

---

### GET /orders/:id — Detalle con items

```bash
curl -s "http://localhost:3000/orders/<ORDER_ID>" \\
  -H "Cookie: closy_session=<tu-session-cookie>" | jq .
```

Respuesta `200`: orden completa con array `items[]`. Errores: `404` | `403` multi-tenant

---

### PATCH /orders/:id/status — Actualizar estado (FSM)

```bash
curl -s -X PATCH "http://localhost:3000/orders/<ORDER_ID>/status" \\
  -H "Cookie: closy_session=<tu-session-cookie>" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "confirmed"}' | jq .
```

**FSM**: `pending_payment → confirmed|cancelled` | `confirmed → paid|cancelled` | `paid → shipped` | `shipped → delivered`

Errores: `400` transición inválida | `404` no existe | `403` multi-tenant

---

### Evidence por AC — PR-FE-06

- ✅ **AC-01..08**: Backend — `orders.controller.spec.ts` (18 tests, 846 total pasan)
- ✅ **AC-09**: Página `/dashboard/orders` con tabla TanStack | `apps/dashboard/src/app/dashboard/orders/page.tsx`
- ✅ **AC-10..20**: Componentes en `apps/dashboard/src/app/dashboard/orders/components/`
- ✅ **AC-18**: Badge `usePendingOrdersCount` sidebar desktop + mobile | `layout.tsx`
- ✅ **AC-19**: Polling 30s `refetchInterval: 30_000` | `use-orders.ts`

---

## PR-FE-04.1 — Catalog Inline Edit

### PATCH /api/product-variants/:id — Editar variante inline

Auth: Session Cookie (dashboard) | Ownership check: variant → product → merchantId

```bash
# Actualizar precio de variante
curl -s -X PATCH "http://localhost:3000/api/product-variants/<VARIANT_ID>" \
  -H "Cookie: session_id=<tu-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"price": 35000}' | jq .

# Actualizar stock de variante
curl -s -X PATCH "http://localhost:3000/api/product-variants/<VARIANT_ID>" \
  -H "Cookie: session_id=<tu-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"stock": 8}' | jq .

# Actualizar precio y stock juntos (patch parcial)
curl -s -X PATCH "http://localhost:3000/api/product-variants/<VARIANT_ID>" \
  -H "Cookie: session_id=<tu-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"price": 35000, "stock": 15}' | jq .
```

Respuesta `200`:

```json
{
  "id": "01936b9d-7e5a-7001-8c85-2f0e1234abcd",
  "productId": "01936b9d-7e5a-7001-8c85-2f0e12345678",
  "sku": "CAM-PRM-WHT-M",
  "name": "M",
  "price": 35000,
  "stock": 15,
  "isActive": true,
  "createdAt": "2026-03-01T10:00:00.000Z",
  "updatedAt": "2026-03-09T15:30:00.000Z"
}
```

Errores: `400` validación (precio negativo, stock float) | `401` sin sesión | `404` variant no existe o pertenece a otro merchant

### PATCH /api/products/:id — Editar nombre de producto

```bash
curl -s -X PATCH "http://localhost:3000/api/products/<PRODUCT_ID>" \
  -H "Cookie: session_id=<tu-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Camiseta Premium Blanca"}' | jq .
```

Respuesta `200`: producto completo con `variants[]`. Errores: `400` | `401` | `404` multi-tenant

### Evidence por AC — PR-FE-04.1

- ✅ **AC-01**: `update-variant.dto.spec.ts` — DTO valida price>=0, stock entero>=0, campos opcionales
- ✅ **AC-02**: `catalog-management.e2e-spec.ts` — PATCH variant con ownership correcto → 200
- ✅ **AC-03**: `catalog-management.e2e-spec.ts` — PATCH variant otro merchant → 404
- ✅ **AC-04**: `product.repository.spec.ts` — `updateVariantById()` + `findVariantByIdWithProduct()`
- ✅ **AC-05**: Esta sección de documentación con cURL copy-paste
- ✅ **AC-06**: `EditableCell` component — modo lectura por defecto, edit on click, rollback
- ✅ **AC-07**: `products-table.tsx` — columna Nombre con `EditableCell` → PATCH /api/products/:id
- ✅ **AC-08**: `products-table.tsx` — columna Precio con `EditableCell` → PATCH /api/product-variants/:id
- ✅ **AC-09**: `products-table.tsx` — columna Stock con `EditableCell` → PATCH /api/product-variants/:id
- ✅ **AC-10**: `use-catalog-mutations.ts` — `useUpdateProduct()` + `useUpdateVariant()` invalidan cache
- ✅ **AC-11**: `EditableCell` — validación client-side: precio negativo, stock no entero, nombre vacío
- ✅ **AC-12**: Optimistic update TanStack Query + rollback on error (catch → setTempValue(originalValue))

---

## PR-18: Product Images API — R2 Storage

### Prerequisitos

1. Crear bucket R2 y obtener API Keys (ver `docs/setup/cloudflare-r2-setup.md`)
2. Configurar en `.env`:
   ```
   R2_ACCOUNT_ID=<tu-account-id>
   R2_ACCESS_KEY_ID=<access-key>
   R2_SECRET_ACCESS_KEY=<secret-key>
   R2_BUCKET_NAME=closy-bot-products
   R2_PUBLIC_URL=https://pub-<hash>.r2.dev
   ```
3. Obtener `session_id` cookie válida (endpoint: `GET /auth/login/google`)

### POST /api/products/:productId/image — Upload imagen principal

**Auth**: Session Cookie (dashboard)  
**Body**: `multipart/form-data`, campo `image` (JPEG / PNG / WebP, ≤5 MB)  
**Response**: `{ imageKey: string, imageUrl: string }`

```bash
# Subir imagen a un producto (reemplaza imagen anterior si existe)
curl -X POST http://localhost:3000/api/products/<PRODUCT_ID>/image \
  -H "Cookie: session_id=<SESSION_ID>" \
  -F "image=@/ruta/a/imagen.jpg;type=image/jpeg"
```

**Respuesta exitosa** (201 Created):
```json
{
  "imageKey": "<merchantId>/products/<productId>/1741234567890-a1b2c3.webp",
  "imageUrl": "https://pub-<hash>.r2.dev/<merchantId>/products/<productId>/1741234567890-a1b2c3.webp"
}
```

**Errores**:
- `400 Bad Request` — archivo ausente, MIME no permitido, magic bytes mismatch (ej: EXE como JPG), >5 MB
- `401 Unauthorized` — sin sesión o sesión expirada
- `403 Forbidden` — producto pertenece a otro merchant
- `500 Internal Server Error` — R2 no configurado o error de red

### DELETE /api/products/:productId/image — Eliminar imagen

**Auth**: Session Cookie (dashboard)  
**Response**: `204 No Content` (silencioso si el producto no tiene imagen)

```bash
# Eliminar imagen de un producto
curl -X DELETE http://localhost:3000/api/products/<PRODUCT_ID>/image \
  -H "Cookie: session_id=<SESSION_ID>"
```

**Notas**:
- Elimina el objeto de R2 y limpia `imageKey` / `imageUrl` en la DB
- Si el producto no tenía imagen: retorna 204 sin error (idempotente)
- Ownership check: solo el merchant dueño del producto puede eliminarlo

### Validaciones de seguridad (OWASP)

| Check | Comportamiento |
|-------|---------------|
| MIME whitelist | Solo `image/jpeg`, `image/png`, `image/webp` — rechaza GIF, PDF, SVG |
| Magic bytes (OWASP A03) | Verifica header del archivo: EXE/ZIP/PDF renombrados como `.jpg` → 400 |
| Size limit | >5 MB → 400 Bad Request |
| Ownership (OWASP A01) | `product.merchantId !== session.merchantId` → 403 Forbidden |

### Formato de key R2

```
{merchantId}/products/{productId}/{timestamp_ms}-{6-byte-hex}.webp
```

Ejemplo: `clv1abc123/products/clv1xyz456/1741234567890-a1b2c3d4e5f6.webp`

### Evidence por AC — PR-18

- ✅ **AC-01**: `StorageService.upload()` ejecuta `PutObjectCommand` y retorna URL pública (unit test)
- ✅ **AC-02**: `processProductImage()` llama `sharp.resize(1200).webp(80)` (unit test con mock)
- ✅ **AC-03**: `validateImageFile()` acepta JPEG, PNG, WebP válidos (unit test)
- ✅ **AC-04**: `validateImageFile()` rechaza EXE renombrado como JPG (unit test + E2E)
- ✅ **AC-05**: `POST /api/products/:id/image` con JPEG → 201 `{ imageKey, imageUrl }` (E2E)
- ✅ **AC-06**: `Product.imageKey` + `imageUrl` persisten en DB tras upload (E2E: query Prisma)
- ✅ **AC-07**: `DELETE /api/products/:id/image` → 204, campos null, `StorageService.delete` llamado (E2E)
- ✅ **AC-08**: `POST`/`DELETE` con producto de otro merchant → 403 (E2E)
- ✅ **AC-09**: Doble `POST` → `delete` llamado con key anterior antes del upload (E2E)
- ✅ **AC-10**: `prisma/schema.prisma` tiene `imageKey` + `imageUrl`; migración aplicada sin error
- ✅ **AC-11**: `env.validation.ts` vars R2 definidas como `Joi.string().optional()` (existían desde PR-INFRA-R2)
- ✅ **AC-12**: Ejemplos cURL en esta sección (esta página)

---

## Próximos Pasos

Todos los flujos del MVP Core V1 están implementados. Ver `docs/plan/PR-STACK-core-v1.md` para el estado actualizado.
