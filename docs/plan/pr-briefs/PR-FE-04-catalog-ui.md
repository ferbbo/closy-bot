# Brief — PR-FE-04 — Dashboard: Catalog UI

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-04-catalog-ui.md`
> **Issue**: [#107](https://github.com/ferbbo/closy-bot/issues/107)
> **Parallel Mode**: `true`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear página `/dashboard/catalog` en el merchant dashboard que permite: (a) importar catálogo vía drag & drop CSV con feedback visual de stats, (b) visualizar productos existentes en tabla responsive, y (c) ver estado del catálogo en un vistazo. Habilita al merchant gestionar inventario desde UI sin usar cURL.

## Scope fence

### ✅ Included

- Página `/dashboard/catalog` con layout responsive (mobile-first)
- **Zona de upload**: componente drag & drop para CSV (file input fallback)
- **Import feedback**: mostrar stats (created, updated, errors) tras upload exitoso
- **Tabla de productos**: lista con columnas (nombre, categoría, SKU, precio, stock, activo)
- **Empty state**: CTA "Importar catálogo" si no hay productos
- **Loading states**: skeleton components durante fetch/upload
- Consumir endpoints:
  - `POST /api/catalog/import-file` (multipart/form-data) — PR-17
  - `GET /api/products` (lista simple, sin paginación por ahora) — PR-03.7
- TanStack Query hooks: `useProducts()`, `useImportCatalog()`
- Validación client-side: extensión `.csv`, tamaño máx 5MB
- Error handling: 401 → logout redirect, 400 → error message, 413 → payload too large
- Contador de productos en sidebar/header (opcional enhancement)

### ❌ Excluded

- **CRUD individual inline**: editar/crear/eliminar productos individualmente (PR futuro)
- **Editor de variantes**: management avanzado de SKUs (PR futuro)
- **Paginación**: tabla muestra todos los productos (aceptable para MVP con <100 productos)
- **Filtros/búsqueda**: no necesario para single merchant MVP inicial
- **Preview CSV**: validación visual pre-upload (PR futuro)
- **Historico de imports**: log de uploads pasados (PR futuro)
- **Export CSV**: descarga del catálogo (PR futuro)
- **Imágenes en tabla**: solo nombres por ahora (PR futuro)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear página `/dashboard/catalog` con componente drag & drop CSV | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-01, AC-02 |
| REQ-02 | Implementar hook `useImportCatalog()` consumiendo `POST /api/catalog/import-file` | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-03, AC-04 |
| REQ-03 | Mostrar stats de import (created, updated, errors) tras upload | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-05 |
| REQ-04 | Implementar hook `useProducts()` consumiendo `GET /api/products` | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-06 |
| REQ-05 | Tabla de productos con columnas básicas (nombre, categoría, SKU, precio, stock, activo) | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-07, AC-08 |
| REQ-06 | Empty state cuando no hay productos con CTA "Importar catálogo" | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-09 |
| REQ-07 | Validaciones client-side (extensión, tamaño) y error handling | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-10, AC-11 |
| REQ-08 | Loading states con Skeleton components | [#107](https://github.com/ferbbo/closy-bot/issues/107) | AC-12 |

> **Nota**: Todos los REQs apuntan al mismo issue ([#107](https://github.com/ferbbo/closy-bot/issues/107)).

## Paths a tocar (concretos)

### Nuevos

```
apps/dashboard/src/
├── app/
│   └── dashboard/
│       └── catalog/
│           ├── page.tsx                         # Página principal (REQ-01, REQ-06)
│           └── components/
│               ├── catalog-upload.tsx           # Drag & drop upload (REQ-01, REQ-02)
│               ├── import-stats-card.tsx        # Stats feedback (REQ-03)
│               ├── products-table.tsx           # Tabla productos (REQ-05)
│               └── empty-catalog-state.tsx      # Empty state (REQ-06)
├── hooks/
│   └── use-catalog.ts                           # TanStack Query hooks (REQ-02, REQ-04)
└── lib/
    └── api.ts                                   # Agregar interfaces Product, Variant, Import (modificado)
```

### Modificados

- `apps/dashboard/src/lib/api.ts` — agregar interfaces `Product`, `ProductVariant`, `ImportStats`, request/response types
- `apps/dashboard/src/app/dashboard/layout.tsx` — ya tiene nav link "Catálogo" (verificar activo)

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Merchant sin catálogo (cold start)

1. User navega a `/dashboard/catalog`
2. UI muestra empty state:
   - Ilustración folder vacío
   - Texto: "No tienes productos en tu catálogo"
   - Botón CTA: "Importar catálogo CSV"
3. User click CTA → focus en zona de upload
4. User arrastra `catalog.csv` (50 productos)
5. Upload inicia → loading spinner + "Importando..."
6. Backend responde 200:
   ```json
   {
     "success": true,
     "created": 50,
     "updated": 0,
     "errors": []
   }
   ```
7. UI muestra toast success: "✅ 50 productos importados correctamente"
8. Tabla se carga automáticamente con 50 productos

#### Escenario 2: Merchant actualiza catálogo (idempotente)

1. User ya tiene 50 productos en tabla
2. User arrastra `catalog-update.csv` (60 productos: 50 existentes + 10 nuevos)
3. Upload procesa
4. Backend responde:
   ```json
   {
     "success": true,
     "created": 10,
     "updated": 50,
     "errors": []
   }
   ```
5. UI muestra card expandible:
   - ✅ 10 productos nuevos creados
   - 🔄 50 productos actualizados
   - ✅ 0 errores
6. Tabla se refresca mostrando 60 productos

#### Escenario 3: Import con errores (partial success)

1. User arrastra `bad-catalog.csv` con 5 filas malformadas
2. Backend responde:
   ```json
   {
     "success": true,
     "created": 45,
     "updated": 0,
     "errors": [
       { "row": 12, "field": "price", "message": "Precio debe ser número positivo" },
       { "row": 23, "field": "sku", "message": "SKU requerido" },
       { "row": 45, "message": "Fila inválida" },
       { "row": 67, "field": "stock", "message": "Stock debe ser entero" },
       { "row": 89, "field": "price", "message": "Precio requerido" }
     ]
   }
   ```
3. UI muestra:
   - Toast warning: "⚠️ 45 productos importados con 5 errores"
   - Card expandible con lista de errores (collapsible accordion)
4. Tabla muestra los 45 productos creados correctamente

#### Escenario 4: Validación client-side (archivo inválido)

1. User arrastra `products.xlsx` (no CSV)
2. UI muestra error inmediato (sin enviar al backend):
   - Toast error: "❌ Solo se permiten archivos CSV"
3. User arrastra `huge-catalog.csv` (8MB, límite 5MB)
4. UI muestra:
   - Toast error: "❌ Archivo demasiado grande (8MB). Límite: 5MB"

#### Escenario 5: Ver catálogo existente (tabla)

1. User navega a `/dashboard/catalog` (ya tiene productos)
2. Tabla muestra columnas:
   - **Nombre** (ej: "Camiseta Básica Blanca")
   - **Categoría** (ej: "Ropa")
   - **SKU** (ej: "CAM-BAS-WHT-M")
   - **Precio** (ej: "$25.000")
   - **Stock** (ej: "12 unidades")
   - **Estado** (badge: "Activo" verde / "Inactivo" gris)
3. Tabla es responsive (mobile: muestra solo nombre + precio en card layout)

### API Endpoints Consumidos (Backend ya implementado)

| Endpoint | Method | Auth | Body | Response | Error |
|----------|--------|------|------|----------|-------|
| `/api/catalog/import-file` | POST | Session Cookie | FormData: `file` (CSV) | `ImportResponseDto` | 400, 401, 413 |
| `/api/products` | GET | Session Cookie | Query: `limit` (opcional) | `{ data: Product[], total: number }` | 401 |

### TypeScript Interfaces (`lib/api.ts`)

```typescript
// Backend response structure (from PR-03.7)
export interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  imageUrls: string[];
  categoryId: string;
  category: {
    id: string;
    name: string;
  };
  isActive: boolean;
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: number; // Decimal as number in JSON
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Import response (from PR-17)
export interface ImportStats {
  success: boolean;
  created: number;
  updated: number;
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
}
```

### TanStack Query Hooks (`hooks/use-catalog.ts`)

```typescript
export function useProducts() {
  return useQuery<{ data: Product[]; total: number }>({
    queryKey: ['products'],
    queryFn: api.getProducts,
    staleTime: 30_000, // 30s cache
  });
}

export function useImportCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.importCatalogFile(formData),
    onSuccess: () => {
      // Invalidate products list to refetch
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

### File upload component pattern (drag & drop)

- Use `react-dropzone` library (already in deps?) or native `<input type="file" accept=".csv" />`
- Validations:
  - `file.type === 'text/csv'` OR `file.name.endsWith('.csv')`
  - `file.size <= 5 * 1024 * 1024` (5MB)
- Show drag overlay cuando user arrastra archivo sobre zona
- FormData construction:
  ```typescript
  const formData = new FormData();
  formData.append('file', file);
  // Do NOT set Content-Type header (browser auto-sets with boundary)
  ```

## Comportamiento

### Happy path

1. User navega a `/dashboard/catalog`
2. Hook `useProducts()` fetches productos vía `GET /api/products`
3. Si productos.length > 0 → muestra tabla
4. Si productos.length === 0 → muestra empty state con CTA upload
5. User selecciona/arrastra CSV válido
6. Client valida extensión + tamaño → pasa
7. `useImportCatalog()` envía FormData a `POST /api/catalog/import-file`
8. Backend procesa y responde 200 con stats
9. UI muestra stats card (created, updated, errors si hay)
10. Hook invalida `['products']` → tabla se refresca automáticamente

### Edge cases

- **Archivo no-CSV**: validación client-side → rechaza antes de enviar
- **Archivo >5MB**: validación client-side → toast error
- **Network error**: catch error → toast "Error de conexión, intenta de nuevo"
- **401 Unauthorized**: api client intercepta → redirect a `/login`
- **413 Payload Too Large**: backend rechaza → toast "Archivo demasiado grande"
- **Import con errores**: success=true pero errors[] tiene items → mostrar warning con detalle
- **Import fail completo**: success=false → toast error con mensaje
- **Tabla vacía tras fetch**: puede ser merchant sin productos o error → distinguir con loading state

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Página `/dashboard/catalog` renderiza correctamente | screenshot: página con zona upload y tabla |
| AC-02 | Drag & drop zone acepta archivo CSV válido | test manual: arrastrar CSV → upload inicia |
| AC-03 | `useImportCatalog()` envía FormData correcto a backend | Network DevTools: FormData con field `file` |
| AC-04 | Backend responde 200 con ImportStats | test manual: import exitoso → stats visibles |
| AC-05 | UI muestra stats (created, updated, errors) tras upload | screenshot: card con stats expandido |
| AC-06 | `useProducts()` fetches productos correctamente | React DevTools: query data poblado |
| AC-07 | Tabla muestra productos con columnas correctas | screenshot: tabla con ≥5 productos |
| AC-08 | Badge de estado "Activo/Inactivo" renderiza correctamente | screenshot: badges verdes y grises |
| AC-09 | Empty state muestra CTA cuando no hay productos | screenshot: empty state con botón CTA |
| AC-10 | Validación client-side rechaza archivos no-CSV | test manual: arrastrar .xlsx → error inmediato |
| AC-11 | Validación client-side rechaza archivos >5MB | test manual: arrastrar archivo grande → error |
| AC-12 | Loading states con Skeleton durante fetch | screenshot: skeleton placeholder durante carga |

## Plan de pruebas

### Unit (opcional para MVP)

- No requerido. Componentes simples con lógica en hooks.

### Integration (manual)

- Subir CSV válido con 10 productos → verificar tabla muestra 10 productos
- Subir CSV con productos duplicados (mismo SKU) → verificar "updated" count
- Subir CSV con errores → verificar stats card muestra errores con detalle
- Arrastrar archivo .txt → verificar error client-side
- Arrastrar archivo 7MB → verificar error client-side
- Merchant sin productos → verificar empty state
- 401 error → verificar redirect a login

### Manual (browser)

1. Dev startup: `pnpm dev` (backend) + `pnpm dev:dashboard` (frontend)
2. Login OAuth → navegar a `/dashboard/catalog`
3. Verificar empty state si sin productos
4. Descargar `examples/catalog-template.csv` y arrastrarlo
5. Verificar import stats card
6. Verificar tabla poblada con productos
7. Verificar responsive en mobile (Chrome DevTools)

## DoD

- [ ] Todos los AC tienen evidencia (screenshots + manual test log)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Página `/dashboard/catalog` accesible y responsive
- [ ] Drag & drop CSV funcional con feedback visual
- [ ] Tabla productos muestra datos correctos
- [ ] Empty state renderiza cuando no hay productos
- [ ] Validaciones client-side funcionan
- [ ] Error handling completo (401, 400, 413)
- [ ] Loading states implementados
- [ ] TanStack Query hooks configurados con invalidación correcta
- [ ] `pnpm build`, `pnpm lint`, `npx tsc --noEmit` pasan sin errores
- [ ] Manual test exitoso con `examples/catalog-template.csv`

## Constraints

- **PII**: no aplica (productos no son PII)
- **Performance**: tabla sin paginación OK para <100 productos MVP. Si crece, agregar en PR futuro.
- **Guardrails**: no aplica (no hay LLM en esta UI)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| CSV malformado crashea frontend | Backend valida y retorna errors[]. Frontend muestra errores sin crashear. |
| Upload grande bloquea UI | Mostrar loading state durante upload. Límite 5MB evita uploads gigantes. |
| Tabla lenta con >100 productos | MVP tolera latencia. Paginación/virtualización en PR futuro. |
| race condition: upload + fetch simultáneos | `onSuccess` de mutation invalida query → refetch automático evita stale data. |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
