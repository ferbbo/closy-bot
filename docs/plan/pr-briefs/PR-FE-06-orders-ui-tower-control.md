# Brief — PR-FE-06 — Dashboard: Orders UI ("Torre de Control")

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-06-orders-ui-tower-control.md`
> **Issue**: [#109](https://github.com/ferbbo/closy-bot/issues/109)
> **Parallel Mode**: `true`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear la página `/dashboard/orders` ("Torre de Control") para que el merchant supervise y gestione pedidos desde el dashboard web, con acciones inline de cambio de status. Incluye endpoints backend REST necesarios para consultar y actualizar órdenes (multi-tenancy secured).

## Scope fence

### ✅ Included

**Backend (API REST):**
- `OrdersController` con endpoints:
  - `GET /orders` — lista de órdenes del merchant (con filtros: status, fecha, orderCode)
  - `GET /orders/:id` — detalle de una orden
  - `PATCH /orders/:id/status` — cambiar status de orden (confirmed → paid → shipped → delivered, cancellation)
- DTOs: `OrderListQueryDto`, `OrderResponseDto`, `UpdateOrderStatusDto`
- Guards: Session auth (reusa `SessionAuthGuard` de PR-12)
- Multi-tenancy: todas las queries filtradas por `merchantId` del session
- Validación: cambios de status permitidos según FSM (pending_payment → confirmed → paid → shipped → delivered)
- OpenAPI decorators para documentación automática

**Frontend (Dashboard UI):**
- Página `/dashboard/orders` con:
  - Lista de pedidos con TanStack Table (sorting, filtering client-side)
  - Status badges coloreados (pending, confirmed, paid, shipped, delivered, cancelled)
  - Filtros: status (multi-select), fecha (range picker), orderCode (search input)
  - Detalle expandible inline: items, cliente, dirección, método de pago, total
  - Acciones inline por status:
    - pending_payment → "Confirmar pedido"
    - confirmed → "Marcar como pagado"
    - paid → "Marcar como enviado"
    - shipped → "Marcar como entregado"
    - any → "Cancelar pedido" (con confirmación modal)
- Contador de pendientes en sidebar (badge rojo)
- Polling cada 30s para actualizar lista automáticamente
- Loading states con Skeleton UI
- Error handling completo (401, 403, 500, network)
- Responsive mobile-first (table horizontal-scroll en mobile)

### ❌ Excluded

- Historial de cambios de status (audit log) — futuro
- Notificaciones push/WebSocket real-time — polling OK para MVP
- Export CSV — futuro
- Filtros avanzados (cliente, monto, producto) — V1 tiene filtros básicos
- Edición de items/dirección de orden existente — inmutable post-creación
- Integración con shipping providers (tracking number) — futuro
- Vista de timeline de orden — solo status actual con badge
- Dashboard analytics de órdenes — eso es PR-10 (Analytics)
- Bulk actions (aprobar varias órdenes a la vez) — futuro

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear `OrdersController` con endpoint `GET /orders` (filtros: status, dateFrom, dateTo, orderCode) | TBD | AC-01, AC-02 |
| REQ-02 | Endpoint `GET /orders/:id` con validación multi-tenancy | TBD | AC-03 |
| REQ-03 | Endpoint `PATCH /orders/:id/status` con validación FSM de transiciones | TBD | AC-04, AC-05 |
| REQ-04 | DTOs tipados con class-validator: `OrderListQueryDto`, `OrderResponseDto`, `UpdateOrderStatusDto` | TBD | AC-06 |
| REQ-05 | Guards de sesión (reusa `SessionAuthGuard` de PR-12) para todos los endpoints | TBD | AC-07 |
| REQ-06 | Multi-tenancy: todas las queries filtradas por `req.session.merchantId` | TBD | AC-08 |
| REQ-07 | Crear página `/dashboard/orders` consumiendo `GET /orders` | TBD | AC-09, AC-10 |
| REQ-08 | Componente `OrdersTable` con TanStack Table (sorting, filtering client-side) | TBD | AC-11 |
| REQ-09 | Status badges con colores según estado (pending=yellow, paid=green, etc.) | TBD | AC-12 |
| REQ-10 | Fila expandible con detalle de orden (items, cliente, dirección, método de pago, total) | TBD | AC-13 |
| REQ-11 | Filtros UI: status (multi-select), fecha (range picker), orderCode (search) | TBD | AC-14 |
| REQ-12 | Acciones inline por status con mutaciones TanStack Query | TBD | AC-15, AC-16 |
| REQ-13 | Modal de confirmación para "Cancelar pedido" | TBD | AC-17 |
| REQ-14 | Contador de pendientes en sidebar (`orders` count badge) | TBD | AC-18 |
| REQ-15 | Polling cada 30s para refrescar lista automáticamente | TBD | AC-19 |
| REQ-16 | Loading states con Skeleton UI y error handling completo | TBD | AC-20 |

> **Nota**: Todos los REQs apuntan al mismo issue (se crea post-BRIEF GATE).

## Paths a tocar (concretos)

### Backend (nuevos)

```
apps/api/src/
├── controllers/
│   ├── orders.controller.ts              # REQ-01, REQ-02, REQ-03
│   └── orders.controller.spec.ts         # Tests unit
├── dto/
│   ├── order-list-query.dto.ts           # REQ-04
│   ├── order-response.dto.ts             # REQ-04
│   └── update-order-status.dto.ts        # REQ-04
└── services/
    ├── orders.service.ts                 # Lógica de negocio (si no existe)
    └── orders.service.spec.ts
```

### Backend (modificados)

- `apps/api/src/app.module.ts` — registrar `OrdersController`
- `apps/api/src/persistence/prisma/order.repository.ts` — agregar métodos: `findAllByMerchant()`, `findByIdAndMerchant()`, `updateStatus()` (si no existen)

### Frontend (nuevos)

```
apps/dashboard/src/
├── app/
│   └── dashboard/
│       └── orders/
│           ├── page.tsx                          # REQ-07
│           └── components/
│               ├── orders-table.tsx              # REQ-08 (TanStack Table)
│               ├── order-row.tsx                 # REQ-10 (expandible)
│               ├── order-filters.tsx             # REQ-11
│               ├── order-status-badge.tsx        # REQ-09
│               ├── order-actions.tsx             # REQ-12 (botones inline)
│               ├── cancel-order-modal.tsx        # REQ-13
│               └── empty-orders-state.tsx        # Empty state
├── hooks/
│   └── use-orders.ts                             # REQ-07, REQ-12, REQ-15 (TanStack Query)
└── lib/
    └── api.ts                                    # Agregar interfaces Order, OrderItem
```

### Frontend (modificados)

- `apps/dashboard/src/app/dashboard/layout.tsx` — agregar contador badge en nav link "Pedidos"
- `apps/dashboard/src/components/ui/` — agregar componentes shadcn: `table`, `badge`, `select`, `popover` (si no existen)

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Merchant supervisa pedidos del día

1. User navega a `/dashboard/orders`
2. UI ejecuta: `GET /orders?status=pending_payment,confirmed&dateFrom=2026-02-26` (filtro day)
3. Backend retorna JSON con array de órdenes (solo del merchant actual)
4. UI renderiza tabla:
   - Columnas: Order Code, Cliente, Total, Status, Fecha, Acciones
   - Fila 1: `ORD-001`, Juan Pérez, $120,000, Badge amarillo "Pendiente pago", hace 2h, Botón "Confirmar"
   - Fila 2: `ORD-002`, María López, $80,000, Badge azul "Confirmado", hace 1h, Botón "Marcar pagado"
5. User click en fila 1 → expande detalle inline:
   - Items: Producto A (Talla M) x2 — $60,000 | Producto B x1 — $60,000
   - Cliente: Juan Pérez — +57 300 123 4567
   - Dirección: Calle 123 #45-67, Bogotá
   - Método de pago: Contraentrega
   - Total: $120,000

#### Escenario 2: Merchant confirma pedido

1. User click en botón "Confirmar pedido" de ORD-001
2. UI ejecuta: `PATCH /orders/:id/status { "status": "confirmed" }` (optimistic update)
3. Backend valida:
   - Orden pertenece al merchant (`merchantId` match)
   - Transición permitida: `pending_payment → confirmed` ✅
   - Actualiza en DB
4. Backend retorna 200 OK con orden actualizada
5. UI actualiza badge a azul "Confirmado" + botón cambia a "Marcar pagado"

#### Escenario 3: Merchant cancela pedido

1. User click en "Cancelar pedido" (icono rojo)
2. UI muestra modal: "¿Estás seguro? Esta acción no se puede deshacer."
3. User confirma
4. UI ejecuta: `PATCH /orders/:id/status { "status": "cancelled" }`
5. Backend valida y actualiza
6. UI actualiza badge a gris "Cancelado" + oculta acciones

### Endpoints (Backend API)

#### `GET /orders`

**Auth**: Session Cookie (reusa guard de PR-12)

**Query params**:
| Param | Type | Required | Default | Descripción |
|-------|------|----------|---------|-------------|
| `status` | string[] | No | all | Filtro status (ej: `pending_payment,confirmed`) |
| `dateFrom` | string (ISO) | No | — | Fecha desde (inclusive) |
| `dateTo` | string (ISO) | No | — | Fecha hasta (inclusive) |
| `orderCode` | string | No | — | Búsqueda por código (case-insensitive, partial match) |
| `limit` | number | No | 50 | Máximo de resultados |
| `offset` | number | No | 0 | Paginación offset |

**Response 200**:
```typescript
{
  orders: Array<{
    id: string,
    orderCode: string,
    customerName: string,
    customerPhone: string,
    status: OrderStatus,
    totalAmount: string,  // formatted "120000.00"
    shippingAddress: string,
    paymentMethod: string,
    createdAt: string,    // ISO timestamp
    updatedAt: string,
    itemCount: number     // count de items (agregado)
  }>,
  total: number,          // total de órdenes (sin paginación)
  limit: number,
  offset: number
}
```

**Errores**:
- 401: No autenticado → redirect login
- 500: Error interno → mostrar toast error

**cURL example**:
```bash
curl -X GET "http://localhost:3000/orders?status=pending_payment,confirmed&limit=20" \
  -H "Cookie: session_id=<session_id>" \
  -H "Content-Type: application/json"
```

#### `GET /orders/:id`

**Auth**: Session Cookie

**Path params**: `id` (string, order UUID)

**Response 200**:
```typescript
{
  id: string,
  orderCode: string,
  merchantId: string,
  customerId: string,
  customerName: string,
  customerPhone: string,
  status: OrderStatus,
  totalAmount: string,
  shippingAddress: string,
  shippingCost: string,
  paymentMethod: string,
  notes?: string,
  createdAt: string,
  updatedAt: string,
  items: Array<{
    id: string,
    variantId: string,
    quantity: number,
    unitPrice: string,
    snapshotName: string  // "Producto A - Talla M"
  }>
}
```

**Errores**:
- 401: No autenticado
- 403: Orden no pertenece al merchant
- 404: Orden no existe

**cURL example**:
```bash
curl -X GET "http://localhost:3000/orders/clxx123abc" \
  -H "Cookie: session_id=<session_id>" \
  -H "Content-Type: application/json"
```

#### `PATCH /orders/:id/status`

**Auth**: Session Cookie

**Path params**: `id` (string, order UUID)

**Body**:
```typescript
{
  status: OrderStatus  // enum: 'confirmed' | 'paid' | 'shipped' | 'delivered' | 'cancelled'
}
```

**Validación FSM** (transiciones permitidas):
- `pending_payment → confirmed` ✅
- `pending_payment → cancelled` ✅
- `confirmed → paid` ✅
- `confirmed → cancelled` ✅
- `paid → shipped` ✅
- `paid → cancelled` ✅ (con notas)
- `shipped → delivered` ✅
- `delivered → *` ❌ (final state)
- `cancelled → *` ❌ (final state)

**Response 200**:
```typescript
{
  id: string,
  orderCode: string,
  status: OrderStatus,
  updatedAt: string
}
```

**Errores**:
- 400: Transición inválida (ej: `delivered → confirmed`)
- 401: No autenticado
- 403: Orden no pertenece al merchant
- 404: Orden no existe

**cURL example**:
```bash
curl -X PATCH "http://localhost:3000/orders/clxx123abc/status" \
  -H "Cookie: session_id=<session_id>" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'
```

### DTOs (Backend)

#### OrderListQueryDto
```typescript
export class OrderListQueryDto {
  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  orderCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
```

#### UpdateOrderStatusDto
```typescript
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
```

### Frontend (TanStack Query hooks)

#### `useOrders(filters)`
```typescript
// apps/dashboard/src/hooks/use-orders.ts
export const useOrders = (filters: OrderFilters) => {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => apiClient.get<OrdersListResponse>('/orders', { params: filters }),
    staleTime: 30 * 1000,  // 30s (polling en page)
    refetchInterval: 30 * 1000,  // Auto-refetch cada 30s
  });
};
```

#### `useUpdateOrderStatus(orderId)`
```typescript
export const useUpdateOrderStatus = (orderId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (status: OrderStatus) => 
      apiClient.patch(`/orders/${orderId}/status`, { status }),
    onMutate: async (status) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      const previous = queryClient.getQueryData(['orders']);
      
      queryClient.setQueryData(['orders'], (old: any) => {
        // Update order status locally
      });
      
      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback
      if (context?.previous) {
        queryClient.setQueryData(['orders'], context.previous);
      }
      toast.error('Error al actualizar pedido');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Pedido actualizado');
    },
  });
};
```

## Comportamiento

### Happy path

1. Merchant hace login → navega a `/dashboard/orders`
2. UI carga lista de órdenes (últimas 50, todos status)
3. Merchant aplica filtro: status="pending_payment"
4. UI refetch con filtro → muestra solo pendientes
5. Merchant click en fila → expande detalle
6. Merchant click "Confirmar pedido" → status cambia a "confirmed" (optimistic)
7. Backend valida y actualiza → UI sincroniza
8. Después de 30s, polling refetch detecta nuevas órdenes → contador sidebar actualiza

### Edge cases

#### Orden no pertenece al merchant
- User intenta: `GET /orders/:id` de otra empresa
- Backend retorna 403 Forbidden
- UI muestra: "No tienes acceso a este pedido"

#### Transición de status inválida
- User intenta: marcar como "enviado" una orden "pending_payment" (skip "paid")
- Backend retorna 400 Bad Request con mensaje: "Transición no permitida"
- UI rollback optimistic update + toast error

#### Polling detecta cambio externo
- Merchant A confirma pedido desde WhatsApp (command PR-05.1)
- Merchant B tiene abierto dashboard en browser
- Polling refetch (30s) detecta cambio → actualiza tabla automáticamente

#### Network error durante mutation
- User click "Confirmar" → request timeout
- Optimistic update rollback
- Toast: "Error de red. Intenta de nuevo."

#### Empty state
- Merchant nuevo sin pedidos
- UI muestra: ilustración + "No tienes pedidos aún" + CTA "Ver catálogo"

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Endpoint `GET /orders` retorna lista de órdenes del merchant con filtros funcionales | Test e2e: `should return orders filtered by status` |
| AC-02 | Paginación funciona con `limit` y `offset` | Test e2e: `should paginate orders correctly` |
| AC-03 | Endpoint `GET /orders/:id` retorna detalle con items | Test e2e: `should return order detail with items` |
| AC-04 | Endpoint `PATCH /orders/:id/status` actualiza status si transición válida | Test e2e: `should update order status from pending_payment to confirmed` |
| AC-05 | Rechaza transición inválida con 400 | Test e2e: `should reject invalid status transition` |
| AC-06 | DTOs validan correctamente con class-validator | Test unit: validaciones de `OrderListQueryDto`, `UpdateOrderStatusDto` |
| AC-07 | Guards de sesión bloquean acceso no autenticado | Test e2e: `should return 401 if not authenticated` |
| AC-08 | Multi-tenancy: merchant A no puede ver órdenes de merchant B | Test e2e: `should return 403 if order belongs to another merchant` |
| AC-09 | Página `/dashboard/orders` renderiza tabla con órdenes | Manual: captura de pantalla |
| AC-10 | Tabla muestra columnas: orderCode, cliente, total, status, fecha | Manual: verificar columnas |
| AC-11 | TanStack Table sorting funciona (por fecha, total) | Manual: click en headers |
| AC-12 | Status badges tienen colores correctos (pending=yellow, confirmed=blue, paid=green, shipped=purple, delivered=green-dark, cancelled=gray) | Manual: verificar colores |
| AC-13 | Fila expandible muestra detalle: items, cliente, dirección, método de pago, total | Manual: click en fila |
| AC-14 | Filtros UI funcionan: status (multi-select), fecha (range), orderCode (search) | Manual: aplicar filtros y verificar refetch |
| AC-15 | Botón "Confirmar pedido" actualiza status a "confirmed" | Manual: click botón y verificar cambio |
| AC-16 | Botones de acción cambian según status actual de la orden | Manual: verificar botones por status |
| AC-17 | Modal confirmación aparece al cancelar pedido | Manual: click "Cancelar" y verificar modal |
| AC-18 | Contador de pendientes aparece en sidebar con badge rojo | Manual: verificar badge con número |
| AC-19 | Polling refetch funciona cada 30s | Manual: esperar 30s y verificar network tab |
| AC-20 | Loading states y error handling funcionan | Manual: simular delay/error y verificar UI |

## Plan de pruebas

### Backend Unit tests

**OrdersController** (`orders.controller.spec.ts`):
- `should return orders list filtered by merchant` (REQ-01, AC-01)
- `should filter orders by status` (REQ-01, AC-01)
- `should filter orders by date range` (REQ-01)
- `should search orders by orderCode` (REQ-01)
- `should return order detail by id` (REQ-02, AC-03)
- `should update order status if transition valid` (REQ-03, AC-04)
- `should reject invalid status transition` (REQ-03, AC-05)
- `should validate multi-tenancy` (REQ-06, AC-08)

**DTOs validation** (test inline o spec):
- `OrderListQueryDto` valida status enum, limit/offset (REQ-04, AC-06)
- `UpdateOrderStatusDto` valida status enum (REQ-04, AC-06)

### Backend E2E tests

**orders.e2e-spec.ts**:
- `GET /orders should return 401 if not authenticated` (AC-07)
- `GET /orders should return orders for authenticated merchant` (AC-01)
- `GET /orders should filter by status` (AC-01)
- `GET /orders should paginate with limit and offset` (AC-02)
- `GET /orders/:id should return order detail with items` (AC-03)
- `GET /orders/:id should return 403 if order belongs to another merchant` (AC-08)
- `PATCH /orders/:id/status should update from pending_payment to confirmed` (AC-04)
- `PATCH /orders/:id/status should reject invalid transition` (AC-05)

### Frontend Manual tests

- [ ] Renderiza página `/dashboard/orders` con tabla (AC-09, AC-10)
- [ ] Sorting de tabla funciona (AC-11)
- [ ] Status badges con colores correctos (AC-12)
- [ ] Fila expandible muestra detalle completo (AC-13)
- [ ] Filtros UI funcionan correctamente (AC-14)
- [ ] Acciones inline ejecutan mutaciones (AC-15, AC-16)
- [ ] Modal de cancelación funciona (AC-17)
- [ ] Contador sidebar actualiza (AC-18)
- [ ] Polling refetch cada 30s (AC-19)
- [ ] Loading/error states funcionan (AC-20)

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo lo del brief)
- [ ] Endpoints backend con auth session y multi-tenancy secured
- [ ] FSM de status transitions validado en backend
- [ ] Frontend consume endpoints con TanStack Query
- [ ] Polling cada 30s para actualización automática
- [ ] Optimistic updates con rollback en errores
- [ ] Status badges con colores consistentes y UI responsive
- [ ] Modal de confirmación para acciones destructivas
- [ ] Contador de pendientes en sidebar funciona
- [ ] `pnpm lint` pasa en backend y frontend
- [ ] `pnpm test` pasa en backend (unit + e2e)
- [ ] `pnpm build:dashboard` compila sin errores
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con endpoints Orders API

## Constraints

- **API Consumer-First**: Endpoints diseñados para ser testeables con cURL antes de implementar UI.
- **Auth method consistente**: Session Cookie (mismo patrón que PR-12, PR-15, PR-16).
- **Multi-tenancy obligatorio**: Todas las queries filtradas por `merchantId` de session.
- **FSM de status**: Backend valida transiciones permitidas según tabla de FSM.
- **Optimistic updates**: UI actualiza inmediatamente con rollback en error.
- **Polling vs WebSocket**: MVP usa polling (30s). WebSocket es futuro.
- **Mobile-first**: Tabla responsive con horizontal-scroll en mobile.

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-----------|
| Transición de status inválida (race condition) | Media | Medio | Validación FSM en backend + optimistic rollback en UI |
| Polling excesivo (N merchants) causa carga | Baja | Medio | Polling es por cliente (browser). Cachear queries con staleTime. |
| Falta de real-time genera confusión | Media | Bajo | Polling 30s es suficiente para MVP. WebSocket es mejora futura. |
| Tabla grande (100+ órdenes) lenta | Baja | Bajo | Paginación backend + limit default 50. Virtualization futuro si necesario. |
| Merchant A cancela pedido mientras B lo confirma | Baja | Alto | Validación backend con `updatedAt` check. Último write gana. Refetch en UI. |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| | | |
