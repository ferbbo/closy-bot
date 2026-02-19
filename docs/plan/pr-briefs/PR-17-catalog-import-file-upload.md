# Brief — PR-17 — Catalog Import File Upload

> **Status**: `AMENDED`
> **Archivo**: `docs/plan/pr-briefs/PR-17-catalog-import-file-upload.md`
> **Issue:** [#60](https://github.com/ferbbo/closy-bot/issues/60)
> **Regla**: Máx 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Permitir upload de archivo CSV real via `multipart/form-data` para UX drag & drop en UI, reemplazando el método actual JSON-only que dificulta la integración con frontends.

## Scope fence

### ✅ Included

- Nuevo endpoint `POST /api/catalog/import-file` con `@UseInterceptors(FileInterceptor('file'))`
- Validación de extensión `.csv` y tamaño máximo (5MB por defecto, configurable via env)
- Parseo de `file.buffer.toString('utf-8')` → reutiliza `ImportService.importFromCSV()`
- Guard: `ApiKeyAuthGuard` (mismo auth que endpoint actual)
- Header `Deprecation` en endpoint actual (`/api/catalog/import`) con aviso y link a docs
- Tests unit + e2e (upload real con supertest + multipart/form-data)
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con sección Flujo 4: Catalog Import File Upload + cURL correcto con `-F "file=@..."`
- Variable de entorno `CATALOG_IMPORT_MAX_SIZE_MB` (default: 5) en `.env.example`

### ❌ Excluded

- Streaming para archivos grandes (>10MB) — diferido para V2
- Validación de encoding (asume UTF-8) — diferido para V2
- Preview antes de import — diferido para V2
- Eliminación o modificación del endpoint actual `/api/catalog/import` (mantener backwards compatibility)
- UI/frontend para drag & drop (solo backend API)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|[#60](https://github.com/ferbbo/closy-bot/issues/60) | AC-01, AC-02, AC-03 |
| REQ-02 | Reutilizar lógica existente de ImportService | [#60](https://github.com/ferbbo/closy-bot/issues/60) | AC-04 |
| REQ-03 | Deprecation header en endpoint actual | [#60](https://github.com/ferbbo/closy-bot/issues/60) | AC-05 |
| REQ-04 | Tests e2e con upload real | [#60](https://github.com/ferbbo/closy-bot/issues/60) | AC-06 |
| REQ-05 | Documentación actualizada con cURL correcto | [#60](https://github.com/ferbbo/closy-bot/issues/60)
| REQ-05 | Documentación actualizada con cURL correcto | TBD | AC-07 |

## Paths a tocar (concretos)

- `apps/api/src/catalog-management/catalog-management.controller.ts` (nuevo método + deprecation header)
- `apps/api/src/catalog-management/catalog-management.module.ts` (habilitar Multer si es necesario)
- `docs/BACKEND-EXECUTION-GUIDE.md` (nueva sección Flujo 4)
- `.env.example` (nueva variable `CATALOG_IMPORT_MAX_SIZE_MB`)
- `apps/api/test/catalog-management.e2e-spec.ts` (nuevos tests upload)

## Contratos / Interfaces

### API Consumer Experience (CRITICAL)

**Problema actual:**
UI con drag & drop debe convertir el archivo a string y wrapped en JSON:
```javascript
// Transformación compleja (NO consumer-friendly)
const file = await fileInput.file();
const text = await file.text();
fetch('/api/catalog/import', {
  method: 'POST',
  headers: { 'x-api-key': '...', 'Content-Type': 'application/json' },
  body: JSON.stringify({ csv: text })
});
```

**Solución propuesta:**
UI puede enviar directamente usando FormData nativo:
```javascript
// Consumer-friendly (drag & drop ready)
const formData = new FormData();
formData.append('file', fileInput.files[0]);
fetch('/api/catalog/import-file', {
  method: 'POST',
  headers: { 'x-api-key': '...' },
  body: formData
});
```

### Endpoints

**Nuevo endpoint:**
- **POST** `/api/catalog/import-file`
- Content-Type: `multipart/form-data`
- Auth: `x-api-key` header (o `Authorization: Bearer <key>`)
- Form field: `file` (tipo: Blob/File)
- Response: `ImportResponseDto` (idéntico a endpoint actual)

**Endpoint actual (sin cambios funcionales):**
- **POST** `/api/catalog/import`
- Content-Type: `application/json`
- Se agrega header: `Deprecation: version="2026-04"`
- Se agrega header: `Link: <https://docs.closy.bot/api/catalog-import-file>; rel="alternate"`

### DTOs / payloads

**Request (multipart):**
```
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="catalog.csv"
Content-Type: text/csv

name,description,category,sku,price,stock
Producto 1,...
------WebKitFormBoundary...--
```

**Response:**
```typescript
{
  "success": true,
  "created": 15,
  "updated": 3,
  "errors": []
}
```

### Validación de archivo

- Extensión: `.csv` (case-insensitive)
- Tamaño: `<= CATALOG_IMPORT_MAX_SIZE_MB` MB (default: 5)
- Content-Type: validación opcional (HTTP puede enviar `text/csv` o `application/octet-stream`)

### Errores

| Código | Condición | Response |
|--------|-----------|----------|
| 400 | Extensión no es `.csv` | `{ "statusCode": 400, "message": "Only CSV files are allowed" }` |
| 413 | Archivo > límite | `{ "statusCode": 413, "message": "File size exceeds maximum allowed (5MB)" }` |
| 400 | Archivo vacío | `{ "statusCode": 400, "message": "File is empty" }` |
| 401 | Sin API key | `{ "statusCode": 401, "message": "API key is required" }` |

## Comportamiento

### Happy path

1. Cliente envía `POST /api/catalog/import-file` con `multipart/form-data` + archivo CSV
2. Guard valida API key → resuelve merchant
3. Interceptor valida extensión `.csv` y tamaño <= 5MB
4. Controller lee `file.buffer`, convierte a UTF-8 string
5. Controller llama `importService.importFromCSV(merchantId, csvString)`
6. Retorna stats: `{ success: true, created: X, updated: Y, errors: [] }`

### Edge cases

**Archivo duplicado (mismo contenido):**
- Idempotencia por SKU: productos existentes se actualizan, no duplican
- Respuesta: `updated: N, created: 0`

**Múltiples archivos en el mismo request:**
- FileInterceptor solo acepta 1 archivo
- Otros campos se ignoran

**Encoding no-UTF8:**
- Buffer.toString('utf-8') puede generar caracteres incorrectos
- Error se propagará desde `ImportService` como row error
- MVP: no hay detección automática de encoding

**Archivo sin extensión o `.txt` con contenido CSV válido:**
- Rechazo con 400 Bad Request: "Only CSV files are allowed"
- Motivo: prevenir errores de usuario (arrastró archivo incorrecto)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Archivo `.csv` válido (< 5MB) → 200 + stats | test: `POST /import-file with valid CSV returns stats` |
| AC-02 | Archivo `.txt` → 400 "Only CSV files are allowed" | test: `POST /import-file with .txt file returns 400` |
| AC-03 | Archivo > 5MB → 413 "File size exceeds maximum" | test: `POST /import-file with large file returns 413` |
| AC-04 | Productos importados correctamente via file = via JSON | test: `import-file creates same products as import endpoint` |
| AC-05 | Endpoint actual retorna headers Deprecation + Link | test: `POST /import returns deprecation headers` |
| AC-06 | cURL con `-F "file=@..."` funciona end-to-end | test: E2E con multipart/form-data + comando documentado en BACKEND-EXECUTION-GUIDE.md |
| AC-07 | BACKEND-EXECUTION-GUIDE.md incluye Flujo 4 completo | doc review: sección presente con ejemplo cURL |

## Plan de pruebas

### Unit

- `CatalogManagementController.importFile()`:
  - Mock `file.buffer` con CSV válido → llama `importService.importFromCSV()`
  - Mock `file.originalname` sin `.csv` → lanza BadRequest

### Integration (E2E)

- `POST /api/catalog/import-file`:
  - Con supertest: `attach('file', Buffer.from(csvContent), 'catalog.csv')`
  - Validar response stats (created, updated)
  - Validar productos en DB
- Archivo `.txt` → 400
- Archivo > 5MB → 413
- Sin API key → 401
- Endpoint actual sin cambio funcional (backwards compat)

### Manual (si aplica)

- cURL desde `BACKEND-EXECUTION-GUIDE.md`:
  ```bash
  curl -X POST http://localhost:3000/api/catalog/import-file \
    -H "x-api-key: test-api-key-123" \
    -F "file=@examples/catalog-template.csv"
  ```
- Verificar response: `{ "success": true, "created": X, ... }`

## DoD

- [ ] Todos los AC tienen evidencia (tests + doc actualizado)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (sin lógica solo en memoria) — N/A (reutiliza ImportService)
- [ ] Idempotencia implementada y testeada — N/A (ya implementado en PR-03.7)
- [ ] Guardrails: bot NO inventa precio/stock/políticas/ETA — N/A (no hay bot en este PR)
- [ ] PII minimizada y sin logs de datos sensibles — ✅ (logs PII-safe ya en ImportService)
- [ ] **API endpoints testeable con cURL sin UI** ✅
- [ ] **Auth method es consistente (ApiKeyAuthGuard)** ✅
- [ ] **cURL example funciona copy-paste** ✅ (incluido en AC-06)
- [ ] **BACKEND-EXECUTION-GUIDE.md actualizado ANTES de merge** ✅ (incluido en AC-07)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migrations incluidas — N/A (sin cambios de schema)
- [ ] `.env.example` actualizado con `CATALOG_IMPORT_MAX_SIZE_MB`

## Constraints

- Guardrails: N/A (no hay LLM/bot en este PR)
- PII: N/A (catálogo no contiene PII de clientes)
- File size límite: configurable via env, default 5MB para MVP

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Encoding no-UTF8 causa errores | Media | Bajo | Documentar asunción UTF-8, diferir auto-detección a V2 |
| Upload bloqueante para archivos grandes | Baja | Medio | Límite de 5MB + docs claros, diferir streaming a V2 |
| Endpoint actual deprecado rompe clientes existentes | Baja | Alto | Mantener endpoint funcional, solo agregar headers, docs con migración gradual |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-19 | AC-06: Cambio de "manual: copiar comando de docs y ejecutar" a "test: E2E con multipart/form-data + comando documentado" | SCR #61: Aceptar tests E2E como evidencia equivalente (Builder no tiene servidor arrancado, tests E2E validan flujo completo) |
