# Guía de Ejecución Backend — Core V1 MVP

> Documentación para probar los flujos implementados desde backend (sin frontend).
> 
> **Última actualización:** 2026-02-19

---

## Requisitos Previos

### 1. Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

```bash
# Base de datos
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/closy_bot?schema=public"

# CORS (PR-FE-00) - Para dashboard frontend
# Comma-separated list de orígenes permitidos
# Default dev: http://localhost:3001 (Next.js dashboard)
CORS_ORIGINS="http://localhost:3001"

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

# LLM (opcional)
LLM_ENABLED=true
LLM_PROVIDER="groq"
GROQ_API_KEY="tu-groq-api-key"
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

```bash
# Buscar productos por texto
curl "http://localhost:3000/api/products?q=camisa" \
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

### ❌ Flujos Pendientes (ver PR-STACK)

| Flujo | PR Requerido | Descripción |
|-------|--------------|-------------|
| Agregar al carrito | PR-04 | Intent `ADD_TO_CART` + modelos Cart/CartItem |
| Ver carrito | PR-04 | Intent `VIEW_CART` + flow |
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

### CORS: "Access to fetch blocked" (browser console)

El browser bloquea requests cross-origin.

**Diagnóstico:**

```bash
# Verificar CORS preflight
curl -X OPTIONS http://localhost:3000/auth/me \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Deben aparecer headers:
# Access-Control-Allow-Origin: http://localhost:3001
# Access-Control-Allow-Credentials: true
```

**Soluciones comunes:**

| Problema | Solución |
|----------|----------|
| Origen no permitido | Agregar a `CORS_ORIGINS` en `.env` |
| Falta `credentials: include` | Agregar en fetch del frontend |
| Cookie no se envía | Verificar `SameSite`, `Domain` de la cookie |
| Headers bloqueados | Verificar `allowedHeaders` en CORS config |

**Ejemplo configuración producción:**

```bash
# .env producción
CORS_ORIGINS="https://dashboard.closybot.com,https://admin.closybot.com"
```

---

## Flujo 6: Cart Conversacional (PR-04)

### Descripción

Sistema de carrito de compras conversacional que permite a customers agregar, ver, actualizar y remover productos via mensajes WhatsApp. El carrito tiene TTL de 24h (configurable) y persiste estado en PostgreSQL.

### Modelos

```prisma
enum CartStatus {
  active     // Currently active cart
  abandoned  // TTL expired or manually cleared
  completed  // Converted to Order
}

model Cart {
  id         String     @id @default(cuid())
  customerId String
  merchantId String
  status     CartStatus @default(active)
  expiresAt  DateTime   // TTL: now + 24h default
  items      CartItem[]
}

model CartItem {
  id            String  @id @default(cuid())
  cartId        String
  variantId     String
  quantity      Int     // 1-99
  priceSnapshot Decimal // Captured at add time
  
  @@unique([cartId, variantId]) // Idempotency
}
```

**Guardrails**:
- `priceSnapshot` capturado desde `ProductVariant.price` (bot NO inventa precios)
- Stock validado antes de agregar/actualizar
- Unique constraint `(cartId, variantId)` previene duplicados

### Intents Conversacionales

| Intent | Keywords Ejemplo | Handler |
|--------|------------------|---------|
| ADD_TO_CART | "agregar", "quiero", "añadir", "comprar" | `CartFlow.handleAddToCart()` |
| SHOW_CART | "ver carrito", "mi carrito", "qué tengo" | `CartFlow.handleShowCart()` |
| UPDATE_CART | "cambiar cantidad", "actualizar", "modificar" | `CartFlow.handleUpdateQuantity()` |
| REMOVE_FROM_CART | "quitar", "eliminar", "remover", "sacar" | `CartFlow.handleRemoveItem()` |
| CLEAR_CART | "vaciar carrito", "cancelar pedido" | `CartFlow.handleClearCart()` |

### Ejemplos de Mensajes WhatsApp

#### 1. Agregar Producto al Carrito

**Customer:**
```
Quiero 2 camisas rojas
```

**Bot Response:**
```
✅ Agregado al carrito

📦 Camisa Algodón - Rojo Talla M
💰 $25.00

🛒 Total en tu carrito: $50.00 (2 productos)

Escribe "ver carrito" para revisar o "buscar" para agregar más productos.
```

#### 2. Ver Carrito

**Customer:**
```
ver mi carrito
```

**Bot Response:**
```
🛒 Tu carrito (3 productos)

📦 Camisa Algodón
   Rojo Talla M
   2x $25.00 = $50.00

📦 Zapatos Deportivos
   Negro Talla 42
   1x $80.00 = $80.00

💰 Total: $130.00

✏️ Para modificar cantidades o remover items, escríbeme qué quieres cambiar.
```

#### 3. Actualizar Cantidad

**Customer:**
```
cambiar camisas a 3
```

**Bot Response:**
```
✅ Cantidad actualizada

📦 Camisa Algodón - Rojo Talla M
➡️ Ahora tienes 3 unidades

🛒 Total: $155.00
```

#### 4. Remover Item

**Customer:**
```
quitar zapatos
```

**Bot Response:**
```
✅ Zapatos Deportivos - Negro Talla 42 removido del carrito

Total actualizado: $75.00
```

#### 5. Vaciar Carrito

**Customer:**
```
cancelar todo
```

**Bot Response:**
```
✅ Carrito vaciado correctamente

Escribe "buscar" cuando quieras empezar de nuevo.
```

### Comportamiento TTL

- **Expiración**: Carritos con `expiresAt < now()` son marcados como `abandoned` por job periódico
- **Default**: 24 horas desde creación/última actualización
- **Configurable**: Variable de entorno `CART_TTL_HOURS`
- **Al agregar item a cart expirado**: Se crea nuevo cart `active` con nuevo TTL

### Edge Cases

#### Stock Insuficiente

**Customer:**
```
agregar 10 camisas
```

**Bot (si stock < 10):**
```
😔 Stock insuficiente. Solo quedan 5 unidades de Camisa Algodón - Rojo Talla M
```

#### Producto No Encontrado

**Customer:**
```
agregar pantalones azules
```

**Bot:**
```
😔 No encontré "pantalones azules"

Escribe "buscar" para ver el catálogo.
```

#### Carrito Vacío

**Customer:**
```
ver carrito
```

**Bot:**
```
🛒 Tu carrito está vacío

Escribe "buscar" para explorar productos o simplemente dime qué necesitas.
```

### Testing

#### Unit Tests

```bash
# All cart tests (repositories, services, flows)
pnpm test cart

# Intent classification
pnpm test intent-router
```

#### Manual Testing via WhatsApp

1. Enviar mensaje WhatsApp al número configurado
2. Bot detecta intent automáticamente
3. Respuestas formateadas para WhatsApp (emojis, saltos de línea)

### Notas de Implementación

**Multi-tenancy:** Todos los carritos filtrados automáticamente por `(customerId, merchantId)`.

**Idempotencia:** Agregar mismo `variantId` dos veces → incrementa `quantity` (no crea CartItem duplicado).

**Price Snapshot:** Precio capturado al momento de agregar. Si precio cambia después, carrito mantiene snapshot. Checkout puede recalcular y notificar diferencia.

**Quantity Limits:** Min 1, Max 99 unidades por CartItem.

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
