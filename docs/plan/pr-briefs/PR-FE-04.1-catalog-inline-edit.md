# Brief — PR-FE-04.1 — Dashboard: Catalog Inline Edit

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-04.1-catalog-inline-edit.md`
> **Issue**: [#118](https://github.com/ferbbo/closy-bot/issues/118)
> **Parallel Mode**: `false` (default)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Permitir edición inline de productos y variantes (name, precio, stock) desde la tabla del catálogo, sin re-importar CSV. Habilita al merchant corregir datos rápidamente (precio cambió, actualizó stock) desde la misma vista de tabla con experiencia fluida (click → edita → blur guarda).

## Scope fence

### ✅ Included

**Backend:**
- Nuevo DTO `UpdateVariantDto` con validaciones (`price`, `stock`, `isActive` — todos opcionales)
- Endpoint `PATCH /api/product-variants/:id` con ownership validation
- Método `ProductRepository.updateVariantById(id, data)` — actualiza variante por ID directo (no por SKU)
- Tests unit + e2e (validación, ownership, partial update)
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL examples

**Frontend:**
- Componente genérico `EditableCell` reutilizable (click → input → blur guarda)
- Integración en `products-table.tsx`:
  - Columna "Producto" (name): editable → `PATCH /api/products/:id`
  - Columna "Precio": editable → `PATCH /api/product-variants/:id` (primera variante)
  - Columna "Stock": editable → `PATCH /api/product-variants/:id` (primera variante)
- Hooks TanStack Query: `useUpdateProduct()`, `useUpdateVariant()`
- Validación client-side (name 1-100 chars, precio >= 0, stock >= 0 integer)
- Optimistic updates con rollback on error
- Loading state inline (spinner en celda)
- Toast error si falla

### ❌ Excluded

- **Crear/eliminar productos desde UI** (PR futuro)
- **Crear/eliminar variantes individualmente** (PR futuro)
- **Editar categoría, SKU, descripción** (solo name, precio, stock por ahora)
- **Batch edit** (editar múltiples filas a la vez)
- **Productos con múltiples variantes** (solo se edita primera variante; expansión en PR futuro)
- **Edición inline en mobile** (mobile sigue siendo read-only card layout)
- **Drag & drop reordering** (no necesario para MVP)
- **Undo/redo** (sin historial de cambios por ahora)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear DTO `UpdateVariantDto` con validaciones NestJS | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-01 |
| REQ-02 | Implementar endpoint `PATCH /api/product-variants/:id` con ownership check | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-02, AC-03 |
| REQ-03 | Agregar método `updateVariantById()` a ProductRepository | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-04 |
| REQ-04 | Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL examples | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-05 |
| REQ-05 | Crear componente `EditableCell` genérico (Frontend) | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-06 |
| REQ-06 | Integrar `EditableCell` en columnas Name, Precio, Stock de `products-table.tsx` | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-07, AC-08, AC-09 |
| REQ-07 | Implementar hooks `useUpdateProduct()` y `useUpdateVariant()` con TanStack Query | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-10 |
| REQ-08 | Validaciones client-side + optimistic updates + rollback on error | [#118](https://github.com/ferbbo/closy-bot/issues/118) | AC-11, AC-12 |

> **Nota**: Todos los REQs apuntan al mismo issue ([#118](https://github.com/ferbbo/closy-bot/issues/118)).

## Paths a tocar (concretos)

### Backend (NestJS)

**Nuevos:**
```
apps/api/src/catalog-management/dto/
└── update-variant.dto.ts                      # REQ-01: UpdateVariantDto
```

**Modificados:**
```
apps/api/src/catalog-management/
├── catalog-management.controller.ts           # REQ-02: PATCH /api/product-variants/:id
└── dto/catalog.dto.ts                         # REQ-01: export UpdateVariantDto

apps/api/src/persistence/repositories/
└── product.repository.ts                      # REQ-03: updateVariantById()

docs/
└── BACKEND-EXECUTION-GUIDE.md                 # REQ-04: cURL examples
```

### Frontend (Next.js + Tailwind)

**Nuevos:**
```
apps/dashboard/src/components/ui/
└── editable-cell.tsx                          # REQ-05: componente genérico

apps/dashboard/src/hooks/
└── use-catalog-mutations.ts                   # REQ-07: mutation hooks (nuevo archivo)
```

**Modificados:**
```
apps/dashboard/src/app/dashboard/catalog/components/
└── products-table.tsx                         # REQ-06: integrar EditableCell

apps/dashboard/src/lib/
└── api.ts                                     # REQ-07: agregar updateProduct(), updateVariant()

apps/dashboard/src/hooks/
└── use-catalog.ts                             # REQ-07: mover mutations a use-catalog-mutations.ts (opcional, puede quedar en mismo archivo)
```

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Editar nombre de producto

1. User ve tabla con producto "Camiseta Básica Blanca"
2. User click en celda "Nombre" → celda se convierte en input con valor actual
3. User edita → "Camiseta Premium Blanca"
4. User hace blur (click fuera) → loading spinner inline aparece brevemente
5. Frontend hace `PATCH /api/products/:id` con `{ "name": "Camiseta Premium Blanca" }`
6. Backend valida ownership + actualiza product.name
7. Frontend recibe 200 OK → celda vuelve a solo lectura con nuevo valor
8. Toast: ✅ "Producto actualizado"

#### Escenario 2: Editar precio de variante

1. User ve tabla con precio "$25.000"
2. User click en celda "Precio" → input numérico con valor "25000" (sin signo $)
3. User edita → "30000"
4. User hace blur → loading spinner
5. Frontend hace `PATCH /api/product-variants/:variantId` con `{ "price": 30000 }`
6. Backend valida ownership + actualiza variant.price
7. Frontend recibe 200 OK → celda muestra "$30.000" formateado
8. Toast: ✅ "Precio actualizado"

#### Escenario 3: Editar stock

1. User ve tabla con stock "12 u."
2. User click en celda "Stock" → input numérico con valor "12"
3. User edita → "8"
4. User hace blur → loading spinner
5. Frontend hace `PATCH /api/product-variants/:variantId` con `{ "stock": 8 }`
6. Backend valida + actualiza variant.stock
7. Frontend recibe 200 OK → celda muestra "8 u."
8. Toast: ✅ "Stock actualizado"

#### Escenario 4: Validación client-side (precio negativo)

1. User edita precio → "-100"
2. Frontend valida antes de enviar: precio < 0 → error
3. Toast error: ❌ "Precio debe ser mayor o igual a 0"
4. Celda NO guarda, rollback a valor anterior

#### Escenario 5: Error backend (ownership)

1. User intenta editar producto de otro merchant (caso edge, no debería ocurrir en UI)
2. Frontend hace `PATCH /api/products/:id`
3. Backend responde 404 Not Found (ownership check falló)
4. Frontend rollback a valor anterior
5. Toast error: ❌ "No tienes permiso para editar este producto"

#### Escenario 6: Valor no cambió (no-op)

1. User click en celda Precio → input "25000"
2. User NO edita nada, hace blur inmediatamente
3. Frontend detecta `value === original` → NO hace PATCH
4. Celda vuelve a solo lectura sin spinner, sin toast

#### Escenario 7: Usuario usa cURL para actualizar variante

```bash
curl -X PATCH http://localhost:3000/api/product-variants/01936b9d-7e5a-7001-8c85-2f0e1234abcd \
  -H "Cookie: session=eyJhbGciOiJIUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -d '{"price": 35000, "stock": 15}'

# Response:
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

### Backend API Contract

| Endpoint | Method | Auth | Body | Response | Error |
|----------|--------|------|------|----------|-------|
| `/api/product-variants/:id` | PATCH | Session Cookie | `UpdateVariantDto` | `ProductVariant` | 400, 401, 404 |
| `/api/products/:id` | PATCH | Session Cookie | `UpdateProductDto` (ya existe) | `Product` | 400, 401, 404 |

### TypeScript Interfaces

#### Backend (NestJS DTO)

```typescript
// apps/api/src/catalog-management/dto/update-variant.dto.ts

import { IsNumber, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';

export class UpdateVariantDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

#### Backend (ProductRepository)

```typescript
// apps/api/src/persistence/repositories/product.repository.ts

/**
 * Update variant by ID (direct ID update, NOT by SKU)
 * Used for inline editing in dashboard (PR-FE-04.1)
 * @param id - Variant UUID
 * @param data - Partial update data (price, stock, isActive)
 * @returns Updated variant
 */
async updateVariantById(
  id: string,
  data: { price?: number; stock?: number; isActive?: boolean }
): Promise<ProductVariant> {
  return this.prisma.productVariant.update({
    where: { id },
    data,
  });
}

/**
 * Find variant by ID with product relation (for ownership check)
 * @param id - Variant UUID
 * @returns Variant with product (includes merchantId)
 */
async findVariantByIdWithProduct(
  id: string
): Promise<(ProductVariant & { product: { merchantId: string } }) | null> {
  return this.prisma.productVariant.findUnique({
    where: { id },
    include: {
      product: {
        select: { merchantId: true },
      },
    },
  });
}
```

#### Frontend (api.ts)

```typescript
// apps/dashboard/src/lib/api.ts

export const api = {
  // ... métodos existentes ...

  // Update product (ya existe — verificar que acepta partial)
  updateProduct: (id: string, data: Partial<Product>) =>
    apiFetch<Product>(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Update variant (NUEVO)
  updateVariant: (id: string, data: { price?: number; stock?: number; isActive?: boolean }) =>
    apiFetch<ProductVariant>(`/api/product-variants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
```

#### Frontend (EditableCell component)

```typescript
// apps/dashboard/src/components/ui/editable-cell.tsx

interface EditableCellProps {
  value: string | number;
  type: 'text' | 'number';
  onSave: (newValue: string | number) => Promise<void>;
  maxLength?: number;
  min?: number;
  formatDisplay?: (value: string | number) => string; // ej: price → "$30.000"
  className?: string;
  disabled?: boolean;
}

export function EditableCell({
  value,
  type,
  onSave,
  maxLength,
  min,
  formatDisplay,
  className,
  disabled = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // Select all text on focus
    }
  }, [isEditing]);

  const handleClick = () => {
    if (!disabled) {
      setIsEditing(true);
    }
  };

  const handleBlur = async () => {
    // Validate and save
    const newValue = type === 'number' ? Number(tempValue) : String(tempValue);
    
    // No-op if value didn't change
    if (newValue === value) {
      setIsEditing(false);
      return;
    }

    // Client-side validation
    if (type === 'number' && min !== undefined && newValue < min) {
      toast.error(`Valor debe ser mayor o igual a ${min}`);
      setTempValue(value); // Rollback
      setIsEditing(false);
      return;
    }

    if (type === 'text' && maxLength && String(newValue).length > maxLength) {
      toast.error(`Máximo ${maxLength} caracteres`);
      setTempValue(value); // Rollback
      setIsEditing(false);
      return;
    }

    // Save
    setIsLoading(true);
    try {
      await onSave(newValue);
      setIsEditing(false);
    } catch (error) {
      setTempValue(value); // Rollback on error
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const displayValue = formatDisplay ? formatDisplay(value) : value;

  return (
    <div className={cn('group relative', className)} onClick={handleClick}>
      {isEditing ? (
        <input
          ref={inputRef}
          type={type}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleBlur}
          disabled={isLoading}
          maxLength={maxLength}
          min={min}
          className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      ) : (
        <div className="px-2 py-1 rounded cursor-pointer hover:bg-gray-50 group-hover:ring-1 group-hover:ring-gray-200">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : displayValue}
        </div>
      )}
    </div>
  );
}
```

#### Frontend (TanStack Query hooks)

```typescript
// apps/dashboard/src/hooks/use-catalog.ts (o use-catalog-mutations.ts)

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      api.updateProduct(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { price?: number; stock?: number } }) =>
      api.updateVariant(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

## Comportamiento

### Happy path

1. User navega a `/dashboard/catalog` (productos cargados)
2. User click en celda "Nombre" de un producto → celda entra en modo edición (input)
3. User edita nombre → "Nuevo Nombre"
4. User hace blur (click fuera o Tab) → validación client-side pasa
5. `EditableCell` llama `onSave()` → hook `useUpdateProduct()` ejecuta `PATCH /api/products/:id`
6. Backend valida ownership → producto pertenece al merchant
7. Backend actualiza `product.name` en DB
8. Backend responde 200 con producto actualizado
9. Frontend actualiza con optimistic update (inmediato) y refetch (confirma)
10. Toast success: "Producto actualizado"
11. User puede continuar editando otras celdas

### Edge cases

- **Valor no cambió (no-op)**: frontend detecta `newValue === originalValue` → NO hace PATCH → rollback a solo lectura inmediato (sin spinner, sin toast)
- **Validación client-side falla**: toast error + rollback a valor original → celda vuelve a solo lectura
- **Backend retorna 404 (ownership)**: toast error "Producto no encontrado" + rollback + refetch (por si otro merchant lo borró)
- **Backend retorna 400 (validación)**: toast error con mensaje del backend + rollback
- **Network error**: toast "Error de conexión" + rollback + refetch opcional (puede estar stale)
- **Optimistic update + error**: TanStack Query rollback automático → valor vuelve al anterior en UI
- **Usuario edita, luego hace click en otra celda antes de blur de la primera**: blur handler de la primera celda ejecuta → guarda → nueva celda entra en edición (comportamiento estándar)
- **Usuario hace ESC mientras edita**: cancelar edición → rollback a valor original → volver a solo lectura (feature nice-to-have, no bloqueante)
- **Producto con 0 variantes**: no debería existir (constraint DB), pero si ocurre → precio/stock muestran "—" y no son editables
- **Producto con múltiples variantes (> 1)**: tabla muestra solo primera variante (acordado en scope) → editar precio/stock aplica solo a primera variante

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `UpdateVariantDto` valida correctamente (price >= 0, stock >= 0 integer) | test: `update-variant.dto.spec.ts` |
| AC-02 | `PATCH /api/product-variants/:id` actualiza variante si ownership correcto | test: e2e `catalog-management.e2e-spec.ts` |
| AC-03 | `PATCH /api/product-variants/:id` retorna 404 si variant no pertenece al merchant | test: e2e ownership check |
| AC-04 | `ProductRepository.updateVariantById()` actualiza solo campos enviados (partial) | test: unit `product.repository.spec.ts` |
| AC-05 | `BACKEND-EXECUTION-GUIDE.md` contiene cURL working example para PATCH variant | manual: copy-paste cURL funciona |
| AC-06 | Componente `EditableCell` renderiza en solo lectura por default + entra en edit on click | test: unit `editable-cell.spec.tsx` |
| AC-07 | Click en columna "Nombre" → input editable → blur guarda con `PATCH /api/products/:id` | test manual + screenshot |
| AC-08 | Click en columna "Precio" → input numérico → blur guarda con `PATCH /api/product-variants/:id` | test manual + screenshot |
| AC-09 | Click en columna "Stock" → input numérico → blur guarda con `PATCH /api/product-variants/:id` | test manual + screenshot |
| AC-10 | Hooks `useUpdateProduct()` y `useUpdateVariant()` invalidan cache correctamente | test: verificar que tabla se refresca post-update |
| AC-11 | Validación client-side rechaza precio negativo y stock no-entero | test: manual + unit test de EditableCell |
| AC-12 | Optimistic update funciona + rollback on error visible en UI | test: manual (simular 500 error desde backend) |

## Plan de pruebas

### Backend — Unit Tests

- `update-variant.dto.spec.ts`:
  - DTO valida `price >= 0` correctamente
  - DTO valida `stock >= 0` y es integer
  - DTO permite campos opcionales (todos son `@IsOptional()`)
  - DTO rechaza valores inválidos (price negativo, stock float)

- `product.repository.spec.ts`:
  - `updateVariantById()` actualiza solo campos enviados (partial update)
  - `updateVariantById()` retorna variante actualizada con valores correctos
  - `findVariantByIdWithProduct()` incluye merchantId del producto

### Backend — E2E Tests

- `catalog-management.e2e-spec.ts`:
  - `PATCH /api/product-variants/:id` con session cookie válida → 200 + variante actualizada
  - `PATCH /api/product-variants/:id` sin session cookie → 401
  - `PATCH /api/product-variants/:id` con variant de otro merchant → 404
  - `PATCH /api/product-variants/:id` con price negativo → 400
  - `PATCH /api/product-variants/:id` con stock float → 400
  - `PATCH /api/product-variants/:id` con variant inexistente → 404

### Frontend — Unit Tests

- `editable-cell.spec.tsx`:
  - Renderiza en modo solo lectura por default
  - Entra en modo edición on click
  - Sale de modo edición on blur (sin guardar si valor no cambió)
  - Llama `onSave()` con nuevo valor si cambió
  - Rollback a valor original on validation error
  - Muestra spinner mientras `onSave()` está pending

### Frontend — Manual Tests

- Navegación a `/dashboard/catalog` → tabla cargada
- Click en Name → input aparece con valor actual → editar → blur → toast success + valor actualizado
- Click en Precio → input numérico → editar → blur → valor formateado correctamente ($XX.XXX)
- Click en Stock → input numérico → editar → blur → valor con "u." sufijo
- Editar sin cambiar valor → no hace PATCH (verificar Network DevTools)
- Editar precio a -100 → toast error client-side (antes de PATCH)
- Editar stock a "abc" → validación HTML5 number input previene envío
- Simular error backend 500 → rollback a valor original + toast error

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo name, precio, stock editables)
- [ ] Estado persistido en Postgres (updates guardan en DB)
- [ ] Idempotencia N/A (PATCH es idempotente por naturaleza)
- [ ] Guardrails: bot N/A (feature UI, no conversacional)
- [ ] PII minimizada N/A (no se agrega PII)
- [ ] `pnpm lint` y `pnpm test` pasan (backend + frontend)
- [ ] DB: migrations NO necesarias (no se cambia schema)
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con cURL examples
- [ ] `npx tsc --noEmit` retorna 0 errores (backend + frontend)
- [ ] Ownership check implementado y testeado (variant → product → merchantId)
- [ ] Frontend: optimistic updates con rollback on error implementado
- [ ] No-op cuando valor no cambió (no hace PATCH innecesario)
- [ ] Componente `EditableCell` es genérico y reutilizable (type, validations parametrizadas)

## Constraints

- **API Consumer-First**: endpoints testables con cURL copy-paste
- **Auth consistente**: Session Cookie (igual que otros endpoints dashboard)
- **Productos con múltiples variantes**: solo se edita primera variante (limitación MVP)
- **Mobile**: edición inline solo en desktop (tabla); mobile sigue siendo read-only (card layout)
- **Producto sin variantes**: no debería existir (constraint DB); si ocurre, precio/stock no editables

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Race condition**: dos merchants editan misma variante simultáneamente | Bajo (single merchant por session) | Medio (último write gana) | PostgreSQL MVCC handle automático; last-write-wins aceptable para MVP |
| **Optimistic update muestra valor incorrecto si falla backend** | Medio (network errors) | Bajo | TanStack Query rollback automático implementado |
| **Usuario edita múltiples celdas rápido → múltiples PATCH en paralelo** | Bajo | Bajo | Cada PATCH es independiente e idempotente; OK para MVP |
| **Variant con stock 0 → editable pero no vendible** | Bajo | Bajo | Validación conversacional (chatbot) previene venta si stock <= 0 |
| **updateVariantById() usa ID directo → puede actualizar variant de otro merchant si no se valida ownership** | Alto | Crítico | **Mitigado**: ownership check obligatorio vía JOIN (variant → product → merchantId) |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
