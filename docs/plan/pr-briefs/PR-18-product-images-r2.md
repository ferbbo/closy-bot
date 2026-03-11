# Brief — PR-18 — Product Images API: R2 Storage + Upload/Delete

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-18-product-images-r2.md`
> **Issue**: [#124](https://github.com/ferbbo/closy-bot/issues/124)
> **Parallel Mode**: `false`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Exponer endpoints `POST` y `DELETE` para gestionar la imagen principal de un producto, con validación de seguridad (magic bytes + MIME whitelist), procesamiento WebP con `sharp`, y storage en Cloudflare R2.

## Scope fence

### ✅ Included

- `StorageModule` (`apps/api/src/storage/`) con `StorageService` (upload/delete) vía `@aws-sdk/client-s3`
- `ImageProcessorService`: resize ≤1200px ancho, quality 80, output WebP
- `ImageValidatorService`: MIME whitelist (jpeg/png/webp), magic bytes check, size ≤5MB
- `POST /api/products/:productId/image` — upload/replace (con delete de imagen anterior)
- `DELETE /api/products/:productId/image` — eliminar imagen y limpiar campos en DB
- Guard `SessionAuthGuard` + ownership check (`product.merchantId === session.merchantId`)
- Migración Prisma: campos `imageKey` y `imageUrl` en `Product`; `imageUrls[]` marcado `@deprecated` (sin borrar)
- Actualizar `env.validation.ts`: verificar que vars R2 están correctamente definidas
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL examples
- Tests unit + e2e para todos los flujos

### ❌ Excluded

- Múltiples imágenes por producto
- Upload a `ProductVariant`
- Presigned URLs / direct client upload
- Image transformations on-the-fly (thumbnails, cropping)
- Soporte para GIF, TIFF u otros formatos
- Terraform / IaC para R2

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | `StorageModule` con `StorageService`: métodos `upload(key, buffer, contentType)` y `delete(key)` usando `@aws-sdk/client-s3` apuntando a R2 | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-01 |
| REQ-02 | `ImageProcessorService`: `processProductImage(buffer)` → resize max 1200px ancho, quality 80, output WebP | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-02 |
| REQ-03 | `ImageValidatorService`: `validateImageFile(buffer, mimeType, size)` — MIME whitelist (jpeg/png/webp), magic bytes check, size ≤5MB | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-03, AC-04 |
| REQ-04 | `POST /api/products/:productId/image` acepta `multipart/form-data` campo `image`; retorna `{ imageKey, imageUrl }` | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-05, AC-06 |
| REQ-05 | `DELETE /api/products/:productId/image` elimina objeto de R2 y limpia `imageKey`/`imageUrl` en DB | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-07 |
| REQ-06 | Ambos endpoints protegidos por `SessionAuthGuard`; ownership check: producto de otro merchant → 403 | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-08 |
| REQ-07 | Al reemplazar imagen existente (`POST`), se elimina la imagen anterior de R2 antes de subir la nueva | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-09 |
| REQ-08 | Migración Prisma: agregar `imageKey String? @map("image_key")` e `imageUrl String? @map("image_url")` a `Product` | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-10 |
| REQ-09 | `env.validation.ts`: vars R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`) correctamente tipadas (ya existen como `optional`) | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-11 |
| REQ-10 | `BACKEND-EXECUTION-GUIDE.md` actualizado con cURL examples copy-paste para upload y delete | [#124](https://github.com/ferbbo/closy-bot/issues/124) | AC-12 |

## Paths a tocar (concretos)

- `apps/api/src/storage/` ← nuevo módulo
  - `storage.module.ts`
  - `storage.service.ts`
- `apps/api/src/storage/image/` ← nuevo
  - `image-processor.service.ts`
  - `image-validator.service.ts`
- `apps/api/src/catalog-management/catalog-management.controller.ts` ← nuevos endpoints
- `apps/api/src/catalog-management/catalog-management.module.ts` ← importar StorageModule
- `apps/api/src/catalog-management/dto/catalog.dto.ts` ← DTOs de respuesta imagen
- `apps/api/src/app.module.ts` ← no tocar (StorageModule importado por CatalogManagementModule)
- `apps/api/src/common/config/env.validation.ts` ← verificar vars R2
- `prisma/schema.prisma` ← agregar imageKey/imageUrl a Product
- `prisma/migrations/` ← nueva migración
- `docs/BACKEND-EXECUTION-GUIDE.md`
- `.env.example`

## Contratos / Interfaces

### Endpoints

| Método | Path | Auth | Body | Response 200 |
|--------|------|------|------|--------------|
| `POST` | `/api/products/:productId/image` | Session Cookie | `multipart/form-data` — campo `image` | `{ imageKey: string, imageUrl: string }` |
| `DELETE` | `/api/products/:productId/image` | Session Cookie | — | `204 No Content` |

### DTOs / payloads

| DTO | Campo | Tipo | Regla |
|-----|-------|------|-------|
| `UploadImageResponseDto` | `imageKey` | `string` | Key en R2 |
| `UploadImageResponseDto` | `imageUrl` | `string` | URL pública |

### Persistencia (Prisma)

| Entidad | Campo | Tipo | Constraint |
|---------|-------|------|------------|
| `Product` | `imageKey` | `String?` | Nullable, único por fila |
| `Product` | `imageUrl` | `String?` | Nullable |
| `Product` | `imageUrls` | `String[]` | Existente — mantener, marcar `@deprecated` en comentario |

### Key structure R2

```
{merchantId}/products/{productId}/{timestamp}-{randomHash}.webp
```

### Idempotencia

No aplica (upload es idempotente por naturaleza: replace).

## Comportamiento

### Happy path — Upload

1. Merchant autenticado con sesión activa envía `POST /api/products/:productId/image` con `multipart/form-data`
2. `ImageValidatorService` valida MIME type + magic bytes + size ≤5MB
3. `ImageProcessorService` convierte a WebP (resize ≤1200px, quality 80)
4. Si `product.imageKey` ya existe → `StorageService.delete(oldKey)` primero
5. `StorageService.upload(newKey, buffer, 'image/webp')` → subirlo a R2
6. `ProductRepository.update(productId, { imageKey, imageUrl })`
7. Respuesta: `{ imageKey, imageUrl }`

### Happy path — Delete

1. Merchant autenticado envía `DELETE /api/products/:productId/image`
2. Ownership check
3. Si `product.imageKey` != null → `StorageService.delete(imageKey)`
4. `ProductRepository.update(productId, { imageKey: null, imageUrl: null })`
5. Respuesta: `204 No Content`

### Edge cases

| Caso | Comportamiento esperado |
|------|------------------------|
| Archivo `.exe` renombrado a `.jpg` | Magic bytes check falla → 400 Bad Request |
| Archivo >5MB | Validación size → 400 (o 413 si NestJS lo detecta antes) |
| Producto de otro merchant | Ownership check → 403 Forbidden |
| Producto sin imagen previa al hacer DELETE | 204 silencioso (no error) |
| MIME no permitido (PDF, SVG, etc.) | 400 Bad Request |
| R2 no configurado (vars vacías) | Error 500 + log claro (no 200 silencioso) |

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `StorageService.upload()` sube buffer a R2 y retorna URL pública | Unit test: `describe('StorageService')` con mock `@aws-sdk/client-s3` |
| AC-02 | `processProductImage()` convierte JPEG a WebP <400KB cuando input es JPEG 3MB | Unit test: `describe('ImageProcessorService')` con fixture real |
| AC-03 | `validateImageFile()` acepta JPEG, PNG, WebP válidos | Unit test: `describe('ImageValidatorService')` — archivos válidos |
| AC-04 | `validateImageFile()` rechaza `.exe` renombrado como `.jpg` (magic bytes falla) | Unit test: fixture con header EXE → throws BadRequestException |
| AC-05 | `POST /api/products/:id/image` con JPEG válido → 200 `{ imageKey, imageUrl }` | E2E: `describe('POST /api/products/:id/image')` happy path |
| AC-06 | `Product.imageKey` e `imageUrl` persisten en DB tras upload | E2E: query Prisma al producto tras POST |
| AC-07 | `DELETE /api/products/:id/image` → 204, campos DB null, objeto eliminado de R2 | E2E: `describe('DELETE /api/products/:id/image')` + verificar campos null |
| AC-08 | `POST` / `DELETE` con producto de otro merchant → 403 Forbidden | E2E: sesión merchant-B intenta modificar producto de merchant-A |
| AC-09 | Upload sobre imagen existente → imagen anterior eliminada de R2 (no acumula) | E2E: doble POST, verificar lllamada a `delete` con key anterior |
| AC-10 | `prisma/schema.prisma` tiene `imageKey` e `imageUrl` en `Product`; migración corre sin error | `pnpm db:migrate` pasa; `npx tsc --noEmit` 0 errores |
| AC-11 | `env.validation.ts` define vars R2 con tipos correctos | `pnpm test` de `env.validation.spec.ts` pasa |
| AC-12 | `BACKEND-EXECUTION-GUIDE.md` tiene cURL para upload y delete que funcionan copy-paste | Revisión manual: ejecutar cURL contra servidor local |

## Plan de pruebas

- **Unit:**
  - `StorageService`: mock S3Client, verifica PutObjectCommand y DeleteObjectCommand
  - `ImageProcessorService`: fixture JPEG real ~3MB → verifica output WebP y size reducido
  - `ImageValidatorService`: matriz de archivos válidos e inválidos (JPEG ok, PNG ok, EXE-como-JPEG falla, PDF falla, >5MB falla)

- **Integration / E2E:**
  - Upload happy path (multipart form, session auth)
  - Ownership check (403)
  - Reemplazo de imagen existente (delete previo en R2)
  - Delete sobre producto sin imagen (204 silencioso)
  - Archivo inválido (magic bytes incorrectos → 400)

- **Manual (smoke test):**
  - cURL upload contra servidor local con R2 configurado
  - Verificar URL pública es accesible desde browser

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo lo del brief)
- [ ] `imageKey` e `imageUrl` persistidos en Postgres (sin lógica solo en memoria)
- [ ] Idempotencia de replace: imagen anterior siempre eliminada de R2 al reemplazar
- [ ] Magic bytes check previene MIME spoofing (OWASP A03)
- [ ] Ownership check previene acceso cruzado de merchants (OWASP A01)
- [ ] PII: sin logs de contenido binario ni rutas con datos personales
- [ ] `pnpm lint`, `pnpm test`, `npx tsc --noEmit` pasan sin errores
- [ ] `pnpm db:migrate` corre sin error
- [ ] `.env.example` actualizado con vars R2
- [ ] `BACKEND-EXECUTION-GUIDE.md` con cURL examples funcionales

## Constraints

- Guard: `SessionAuthGuard` (Session Cookie) — consistente con endpoints de dashboard.
- Bot NO inventa URLs de imágenes — solo se usan las URLs confirmadas por el storage.
- PII: el `merchantId` en el key de R2 es técnica, no debe exponerse en logs de nivel INFO.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `sharp` tiene dependencias nativas (C++) — puede fallar en Docker ARM | Usar imagen base `node:20-alpine` con `sharp` pre-instalado; agregar nota en `Dockerfile` |
| R2 no disponible en CI → tests e2e fallan | Mockear `StorageService` en e2e tests; test real solo en smoke manual |
| File interception por NestJS antes de llegar al guard → auth bypass | Orden de decoradores: `@UseGuards(SessionAuthGuard)` ANTES de `@UseInterceptors(FileInterceptor)` |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-03-11 | Brief creado | PR-18 pasa a READY en PR-STACK |
