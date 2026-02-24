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
WHATSAPP_ACCESS_TOKEN="tu-access-token"
WHATSAPP_PHONE_NUMBER_ID="tu-phone-number-id"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="tu-verify-token"
WHATSAPP_APP_SECRET="tu-app-secret"

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
# Levantar PostgreSQL (docker)
docker-compose up -d postgres

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

### ❌ Flujos Pendientes (ver PR-STACK)

| Flujo | PR Requerido | Descripción |
|-------|--------------|-------------|
| Checkout | PR-05 | Captura datos + crear Order |
| Confirmar pago | PR-06 | Webhook + fallback `PAGADO` |
| Estado pedido | PR-07 | Intent `ORDER_STATUS` + flow |
| Tickets | PR-07 | Intent `CREATE_TICKET` + modelo Ticket |
| Handoff | PR-08 | Intent `HANDOFF` + resumen estructurado |

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

## Próximos Pasos

Para completar el flujo de ventas transaccional, implementar:

1. **PR-05 — Checkout** (🔴 CRÍTICO)
   - Modelo `Order`, `OrderItem`
   - Captura de datos (nombre, dirección)
      - Métodos de pago

2. **PR-06 — Pagos**
   - Modelo `Payment`
   - Webhook idempotente
   - Fallback `PAGADO`
