# Brief — PR-FE-04.2 — Dashboard: Catalog Image Upload

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-04.2-catalog-image-upload.md`
> **Issue**: [#126](https://github.com/ferbbo/closy-bot/issues/126)
> **Parallel Mode**: `false` (default)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

UI para upload, preview y eliminación de la imagen principal de un producto desde la tabla del catálogo, consumiendo los endpoints de PR-18 (`POST /api/products/:id/image` y `DELETE /api/products/:id/image`). El merchant puede subir imágenes sin salir de la vista de catálogo.

## Scope fence

### ✅ Included

- Actualizar tipo `Product` en `api.ts` con campos `imageKey?: string` e `imageUrl?: string`
- Métodos en `api.ts`: `uploadProductImage(productId, file)` y `deleteProductImage(productId)`
- Hook `useProductImage()` con TanStack Query mutations (upload + delete); actualiza cache in-place (no full refetch)
- Componente `ProductImageUpload`: zona drag & drop + file picker, preview con `URL.createObjectURL()`, progress indicator
- Componente `ImageModal`: preview, botón "Cambiar imagen" (abre upload), botón "Eliminar" (con confirmación inline)
- Nueva columna "Imagen" en `products-table.tsx` (desktop only): thumbnail 48×48 si tiene imagen, placeholder si no; click abre `ImageModal`
- Validación client-side: extensión (`image/jpeg`, `image/png`, `image/webp`) y tamaño ≤ 5 MB → toast error si falla
- Loading states: spinner en celda/modal durante upload y delete
- Toast de éxito/error (sonner) en español

### ❌ Excluded

- Crop, rotate, filtros de imagen
- Múltiples imágenes por producto
- Upload en mobile (mobile sigue read-only; columna "Imagen" no se agrega en card layout mobile)
- Reordering de imágenes
- Preview de la imagen en la columna a tamaño grande fuera del modal
- Listar o editar `imageUrls[]` (campo deprecated)
- Tests e2e backend (ya cubiertos en PR-18)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Agregar `imageKey?: string` e `imageUrl?: string` al tipo `Product` en `api.ts` | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-01 |
| REQ-02 | Agregar `api.uploadProductImage(productId, file)` → `multipart/form-data` campo `image`; `api.deleteProductImage(productId)` → `DELETE` | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-02 |
| REQ-03 | Implementar `useProductImage()` con mutations `uploadImage` y `deleteImage`; actualizar cache `CATALOG_KEYS.products` con `setQueryData` sin refetch | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-03, AC-04 |
| REQ-04 | Crear `ProductImageUpload`: drag & drop + file picker, preview instantáneo, progress indicator durante upload | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-05, AC-06 |
| REQ-05 | Crear `ImageModal`: muestra preview completo o zona upload; botones "Cambiar imagen" y "Eliminar imagen" con confirm | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-07 |
| REQ-06 | Agregar columna "Imagen" (desktop only) en `products-table.tsx`: thumbnail 48×48 o placeholder; click → `ImageModal` | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-08 |
| REQ-07 | Validación client-side: extensión + tamaño ≤ 5 MB → toast error, sin llamada al backend | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-09 |
| REQ-08 | Build y lint limpios (`pnpm lint`, `pnpm build`, `npx tsc --noEmit`) | [#126](https://github.com/ferbbo/closy-bot/issues/126) | AC-10 |

> **Nota**: Todos los REQs apuntan al mismo issue (a crear post-BRIEF GATE).

## Paths a tocar (concretos)

**Nuevos:**
```
apps/dashboard/src/app/dashboard/catalog/components/
├── product-image-upload.tsx    # REQ-04: componente drag & drop / file picker
└── image-modal.tsx             # REQ-05: modal preview + acciones

apps/dashboard/src/hooks/
└── use-product-image.ts        # REQ-03: TanStack Query mutations
```

**Modificados:**
```
apps/dashboard/src/lib/
└── api.ts                      # REQ-01: imageKey/imageUrl en Product; REQ-02: métodos upload/delete

apps/dashboard/src/app/dashboard/catalog/components/
└── products-table.tsx          # REQ-06: columna "Imagen" con thumbnail/placeholder
```

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Subir imagen (producto sin imagen)

1. Merchant ve tabla; columna "Imagen" muestra icono placeholder gris en la fila del producto
2. Merchant hace click en el placeholder → abre `ImageModal` con zona de drag & drop
3. Merchant arrastra `producto.jpg` a la zona (o hace click → file picker)
4. Preview instantáneo de la imagen seleccionada (antes de subir)
5. Merchant hace click en "Subir imagen" → progress spinner visible
6. Frontend envía `POST /api/products/:id/image` con `FormData` (campo `image`)
7. Backend responde `{ imageKey, imageUrl }`
8. Cache actualizado in-place: `product.imageUrl = imageUrl`
9. Modal cierra → thumbnail 48×48 aparece en tabla
10. Toast: ✅ "Imagen subida"

#### Escenario 2: Reemplazar imagen

1. Merchant hace click en thumbnail existente → `ImageModal` con preview de imagen actual
2. Merchant hace click en "Cambiar imagen" → file picker dentro del modal
3. Selecciona nueva imagen → preview se actualiza
4. Merchant hace click en "Subir imagen" → mismo flujo que Escenario 1
5. Backend elimina imagen vieja de R2 y sube la nueva (comportamiento backend PR-18)

#### Escenario 3: Eliminar imagen

1. Merchant abre `ImageModal` con imagen existente
2. Merchant hace click en "Eliminar imagen" → botón de confirmación inline ("¿Confirmar?")
3. Merchant confirma → spinner
4. Frontend envía `DELETE /api/products/:id/image` → 204
5. Cache actualizado: `product.imageUrl = undefined`, `product.imageKey = undefined`
6. Modal cierra → placeholder aparece en tabla
7. Toast: ✅ "Imagen eliminada"

#### Escenario 4: Archivo inválido (tamaño > 5 MB)

1. Merchant arrastra imagen de 8 MB
2. Validación client-side antes de mostrar preview → falla
3. Toast: ❌ "Imagen demasiado grande. Máximo 5 MB"
4. No se envía petición al backend; modal permanece abierto

#### Escenario 5: Tipo de archivo no soportado

1. Merchant selecciona `documento.pdf`
2. Validación client-side: extensión no en whitelist → falla
3. Toast: ❌ "Solo se permiten JPEG, PNG o WebP"
4. No se envía petición al backend

### Endpoints consumidos (backend PR-18)

| Método | Path | Auth | Body | Respuesta exitosa |
|--------|------|------|------|-------------------|
| `POST` | `/api/products/:productId/image` | Session Cookie | `multipart/form-data` — campo `image` | `{ imageKey: string, imageUrl: string }` |
| `DELETE` | `/api/products/:productId/image` | Session Cookie | — | `204 No Content` |

### Tipos / Interfaces (tabular)

#### Tipo `Product` actualizado (`api.ts`)

| Campo | Tipo | Notas |
|-------|------|-------|
| `imageKey` | `string \| undefined` | Key en R2; puede ser `null` desde backend → `undefined` en frontend |
| `imageUrl` | `string \| undefined` | URL pública de la imagen |
| `imageUrls` | `string[]` | Existente — no modificar, no usar |

#### Hook `useProductImage()` (`use-product-image.ts`)

| Export | Tipo | Descripción |
|--------|------|-------------|
| `uploadImage` | `UseMutationResult<UploadImageResponse, Error, { productId: string; file: File }>` | Sube imagen, actualiza cache |
| `deleteImage` | `UseMutationResult<void, Error, { productId: string }>` | Elimina imagen, actualiza cache |

#### Respuesta `UploadImageResponse`

| Campo | Tipo |
|-------|------|
| `imageKey` | `string` |
| `imageUrl` | `string` |

### Idempotencia

No aplica (upload/delete son naturalmente idempotentes; comportamiento backend ya definido en PR-18).

## Comportamiento

### Happy path

1. Click en placeholder/thumbnail → modal abre
2. Selección de archivo (drag & drop o file picker) → preview instantáneo
3. "Subir imagen" → `multipart/form-data` → backend procesa/almacena → `{ imageKey, imageUrl }`
4. Cache actualizado in-place → thumbnail visible en tabla sin refetch completo
5. Modal cierra automáticamente al éxito

### Edge cases

| Caso | Comportamiento esperado |
|------|------------------------|
| Archivo > 5 MB | Toast error, sin petición backend, modal permanece abierto |
| Tipo de archivo no soportado | Toast error, sin petición backend |
| Delete sin imagen previa | Botón "Eliminar" no visible si `imageUrl` es `undefined` |
| Error backend 403 (ownership) | Toast error: "No tienes permiso", rollback a estado anterior |
| Error backend 500 | Toast error genérico: "Error al subir imagen. Intenta de nuevo" |
| `window.opener` (N/A) | No aplica a este PR |

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `Product` en `api.ts` tiene `imageKey?: string` e `imageUrl?: string` | `npx tsc --noEmit` 0 errores |
| AC-02 | `api.uploadProductImage(id, file)` construye `FormData` con campo `image` y envía a `POST /api/products/:id/image`; `api.deleteProductImage(id)` envía `DELETE` | test unitario del hook o revisión cURL manual |
| AC-03 | `useProductImage().uploadImage` on success actualiza `product.imageUrl` + `product.imageKey` en cache `CATALOG_KEYS.products` sin triggerar refetch del listado | test: `describe('useProductImage — upload')` verifica setQueryData |
| AC-04 | `useProductImage().deleteImage` on success limpia `imageUrl` e `imageKey` (`undefined`) en cache | test: `describe('useProductImage — delete')` verifica setQueryData |
| AC-05 | Drag & drop en `ProductImageUpload`: arrastrar imagen → preview via `URL.createObjectURL()` antes de subir | inspección visual / test |
| AC-06 | Click en file picker en `ProductImageUpload`: selección de archivo → preview | inspección visual |
| AC-07 | `ImageModal` con imagen → click "Eliminar imagen" → confirm → `DELETE` → placeholder en tabla; sin imagen → botón "Eliminar" no visible | inspección visual |
| AC-08 | Columna "Imagen" aparece en tabla desktop; muestra thumbnail `48×48` si `imageUrl` definido; placeholder si no; click abre `ImageModal` | inspección visual |
| AC-09 | Archivo > 5 MB → toast error español, sin fetch; tipo no soportado → toast error español, sin fetch | test: `describe('ProductImageUpload — validación')` |
| AC-10 | `pnpm lint` 0 errores; `pnpm build` exitoso; `npx tsc --noEmit` 0 errores | output de comandos |

## Plan de pruebas

- **Unit (Jest):**
  - `useProductImage` upload: verifica que `setQueryData` actualiza `imageUrl`/`imageKey` en producto correcto del listado
  - `useProductImage` delete: verifica que `setQueryData` limpia `imageUrl`/`imageKey`
  - `ProductImageUpload` validación: archivo > 5 MB → toast error sin `uploadImage` call; tipo inválido → igual
- **Manual (inspección visual):**
  - Drag & drop + preview funciona (no hay forma de testear drag en Jest sin jsdom avanzado)
  - Loading spinner visible durante upload
  - Modal abre/cierra correctamente en ambos estados (con/sin imagen)
  - Thumbnail aparece en tabla después de upload exitoso
  - Placeholder aparece después de delete exitoso

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo lo del brief)
- [ ] Tipo `Product` actualizado con `imageKey`/`imageUrl`
- [ ] Cache actualizado in-place (no full refetch del catálogo)
- [ ] Validación client-side funciona (tamaño + tipo)
- [ ] Loading states visibles en upload y delete
- [ ] `pnpm lint` y `pnpm build` pasan
- [ ] `npx tsc --noEmit` 0 errores
- [ ] No hay `error.message` en ningún catch block (usar `(error as Error).message`)
- [ ] Todas las props de componentes con decoradores usan `!` si aplica

## Constraints

- Auth: Session Cookie (consistente con todos los endpoints del dashboard).
- `multipart/form-data`: NO establecer `Content-Type` manualmente, el navegador lo hace automáticamente con el boundary correcto.
- Preview: usar `URL.createObjectURL()` → llamar `URL.revokeObjectURL()` en cleanup del efecto (evitar memory leak).
- Mobile: no agregar columna "Imagen" en el card layout mobile (fuera de scope).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Memory leak en preview URL | `useEffect` cleanup: `return () => URL.revokeObjectURL(previewUrl)` |
| `product.imageUrl` es `null` (JSON) pero el tipo espera `undefined` | Normalizar en `api.ts`: `imageUrl: product.imageUrl ?? undefined` |
| Columna "Imagen" rompe el layout horizontal de la tabla | Usar ancho fijo `w-16` para la columna; thumbnail con `object-cover rounded` |
| `apiFetchMultipart` no existe para `DELETE` (retorna 204 sin body) | Crear helper privado o usar `fetch` directamente con `credentials: 'include'` para delete (verificar) |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-03-11 | Brief inicial DRAFT | Planner — PR-FE-04.2 |
