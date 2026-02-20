# Brief — PR-04 — Carrito: CRUD conversacional persistido

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-04-cart-crud-conversational.md`
> **Issue**: [#70](https://github.com/ferbbo/closy-bot/issues/70)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Implementar carrito de compra conversacional para WhatsApp: crear, agregar/remover items, ajustar cantidades, mostrar resumen, con persistencia en Postgres, validación de stock/precio real, y expiración automática por TTL.

## Scope fence

### ✅ Included

- Modelos `Cart` y `CartItem` con relaciones a Customer, Merchant, ProductVariant
- `CartService`: create, addItem, updateQuantity, removeItem, getCart, clearCart
- `CartFlow`: manejo conversacional (agregar, remover, mostrar, vaciar)
- IntentRouter: detectar intents `ADD_TO_CART`, `SHOW_CART`, `REMOVE_FROM_CART`, `CLEAR_CART`
- Validaciones: stock disponible, precio real al momento de agregar (guardrails)
- Expiración automática de carritos (TTL configurable, default 24h)
- Respuestas conversacionales en español con formato WhatsApp-friendly
- Tests unitarios (CartService, CartFlow) + e2e (webhook → add → show)

### ❌ Excluded

- Checkout (PR-05)
- Endpoints HTTP REST (solo conversacional en esta PR)
- Cupones/descuentos
- Carrito compartido entre múltiples canales (1 carrito activo por customer/merchant)
- UI/dashboard de carrito
- Notificaciones automáticas de abandono (PR-09)
- Variantes complejas (tallas/colores múltiples; solo se agrega por `variantId`)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Modelo `Cart` con campos: id, customerId, merchantId, status (active/abandoned/completed), expiresAt, createdAt, updatedAt | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-01 |
| REQ-02 | Modelo `CartItem` con campos: id, cartId, variantId, quantity, priceSnapshot, createdAt, updatedAt | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-02 |
| REQ-03 | `CartService.createOrGetActiveCart(customerId, merchantId)`: retorna carrito activo o crea nuevo | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-03 |
| REQ-04 | `CartService.addItem(cartId, variantId, quantity)`: agrega item validando stock y capturando precio real | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-04, AC-05 |
| REQ-05 | `CartService.updateQuantity(cartId, itemId, quantity)`: ajusta cantidad (si qty=0, equivale a remover) | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-06 |
| REQ-06 | `CartService.removeItem(cartId, itemId)`: elimina item del carrito | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-07 |
| REQ-07 | `CartService.getCartSummary(cartId)`: retorna items con subtotal calculado | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-08 |
| REQ-08 | `CartService.clearCart(cartId)`: elimina todos los items y marca carrito como abandoned | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-09 |
| REQ-09 | `CartFlow.handleAddToCart(...)`: detecta producto/variante desde texto, agrega al carrito, responde confirmación | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-10 |
| REQ-10 | `CartFlow.handleShowCart(...)`: muestra resumen conversacional con items, cantidades, precios, total | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-11 |
| REQ-11 | `CartFlow.handleRemoveItem(...)`: detecta item desde texto, remueve, responde confirmación | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-12 |
| REQ-12 | IntentRouter detecta ADD_TO_CART cuando mensaje contiene keywords: "agregar", "añadir", "quiero X", "agrega" + nombre producto | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-13 |
| REQ-13 | IntentRouter detecta SHOW_CART cuando mensaje contiene: "carrito", "ver carrito", "mostrar carrito", "qué tengo" | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-14 |
| REQ-14 | IntentRouter detecta REMOVE_FROM_CART cuando mensaje contiene: "remover", "quitar", "eliminar" + referencia a item | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-15 |
| REQ-15 | Guardrail: precio capturado en `priceSnapshot` desde ProductVariant.price al momento de agregar (no permitir override manual) | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-16 |
| REQ-16 | Guardrail: validar stock disponible antes de agregar (si stock < quantity, responder "solo quedan N unidades") | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-17 |
| REQ-17 | TTL: al crear carrito, setear `expiresAt = now() + 24h` (configurable por env `CART_TTL_HOURS`) | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-18 |
| REQ-18 | Job/scheduler: limpiar carritos expirados (status → abandoned) diariamente | [#70](https://github.com/ferbbo/closy-bot/issues/70) | AC-19 |

> **Nota**: Todos los REQs apuntan al mismo issue [#70](https://github.com/ferbbo/closy-bot/issues/70).

## Paths a tocar (concretos)

**Prisma (schema + migration):**
- `prisma/schema.prisma`: agregar modelos `Cart`, `CartItem`
- `prisma/migrations/`: nueva migración `add_cart_models`

**Domain:**
- `apps/api/src/domain/entities/cart.entity.ts` (nuevo)
- `apps/api/src/domain/entities/cart-item.entity.ts` (nuevo)

**Persistence:**
- `apps/api/src/persistence/repositories/cart.repository.ts` (nuevo)
- `apps/api/src/persistence/repositories/cart-item.repository.ts` (nuevo)

**Services:**
- `apps/api/src/services/cart.service.ts` (nuevo)
- `apps/api/src/services/cart.service.spec.ts` (tests unitarios)

**Orchestrator:**
- `apps/api/src/orchestrator/flows/cart.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/cart.flow.spec.ts` (tests unitarios)
- `apps/api/src/orchestrator/intent/intent-router.service.ts` (extender intents)
- `apps/api/src/orchestrator/conversation.orchestrator.ts` (agregar routing para cart intents)

**Workers:**
- `apps/api/src/workers/cart-cleanup.service.ts` (job @nestjs/schedule, nuevo)
- `apps/api/src/workers/cart-cleanup.service.spec.ts`

**Config:**
- `.env.example`: agregar `CART_TTL_HOURS=24`

**Tests e2e:**
- `apps/api/test/cart.e2e-spec.ts` (nuevo)

## Contratos / Interfaces

### Prisma models:

```prisma
model Cart {
  id         String   @id @default(cuid())
  customerId String   @map("customer_id")
  merchantId String   @map("merchant_id")
  status     CartStatus @default(active) // active, abandoned, completed
  expiresAt  DateTime @map("expires_at")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  customer Customer   @relation(fields: [customerId], references: [id])
  merchant Merchant   @relation(fields: [merchantId], references: [id])
  items    CartItem[]

  @@map("carts")
  @@index([customerId, merchantId, status])
  @@index([expiresAt])
}

enum CartStatus {
  active
  abandoned
  completed
}

model CartItem {
  id            String   @id @default(cuid())
  cartId        String   @map("cart_id")
  variantId     String   @map("variant_id")
  quantity      Int
  priceSnapshot Decimal  @db.Decimal(10, 2) @map("price_snapshot") // Precio al momento de agregar
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id])

  @@map("cart_items")
  @@unique([cartId, variantId]) // 1 entrada por variante en el carrito
  @@index([cartId])
}
```

### CartService interface (métodos principales):

```typescript
interface CartService {
  createOrGetActiveCart(customerId: string, merchantId: string): Promise<Cart>;
  addItem(cartId: string, variantId: string, quantity: number): Promise<CartItem>;
  updateQuantity(cartId: string, itemId: string, quantity: number): Promise<CartItem | null>;
  removeItem(cartId: string, itemId: string): Promise<void>;
  getCartSummary(cartId: string): Promise<CartSummary>;
  clearCart(cartId: string): Promise<void>;
}

interface CartSummary {
  items: Array<{
    id: string;
    productName: string;
    variantName: string;
    quantity: number;
    priceSnapshot: number;
    subtotal: number;
  }>;
  total: number;
  itemCount: number;
}
```

### IntentRouter (nuevos intents):

```typescript
type IntentType = 
  | 'SEARCH_PRODUCT' 
  | 'ADD_TO_CART' 
  | 'SHOW_CART' 
  | 'REMOVE_FROM_CART'
  | 'CLEAR_CART'
  | 'GREETING' 
  | 'HELP' 
  | 'UNKNOWN';
```

### Idempotencia:

- **Dedupe key**: constraint unique en `(cartId, variantId)` para CartItem
- **Strategy**: Si ya existe item con mismo variantId, actualizar quantity (incrementar) en lugar de crear duplicado

## Comportamiento

### Happy path:

1. Usuario: "Quiero agregar camiseta roja talla M"
2. IntentRouter detecta: `ADD_TO_CART`, extrae query "camiseta roja talla M"
3. CartFlow busca producto/variante matching (usa CatalogService)
4. CartService valida stock disponible y precio real
5. CartService agrega item al carrito (o incrementa qty si ya existe)
6. Bot responde: "✅ Agregado: Camiseta Roja - Talla M (1x $25.00)\nTotal en tu carrito: $25.00"

### Edge cases:

#### Stock insuficiente:
- Usuario: "Quiero 100 camisetas"
- CartService valida: solo hay 5 en stock
- Bot responde: "😔 Solo quedan 5 unidades de Camiseta Roja - Talla M. ¿Quieres agregar las 5 disponibles?"

#### Producto ambiguo:
- Usuario: "Quiero camiseta"
- SearchCatalog encuentra múltiples variantes
- Bot responde: "Encontré varias opciones de camiseta:\n1. Camiseta Roja - M - $25\n2. Camiseta Azul - L - $30\n¿Cuál quieres agregar?"

#### Carrito vacío:
- Usuario: "Ver carrito"
- CartService.getCartSummary retorna 0 items
- Bot responde: "🛒 Tu carrito está vacío\n\nEscribe 'buscar' para explorar productos"

#### Duplicados (idempotencia):
- Usuario agrega "camiseta roja M" dos veces
- CartService detecta item existente por constraint unique (cartId, variantId)
- Incrementa quantity en lugar de duplicar entrada

#### Expiración:
- Carrito creado hace 25h (excede TTL de 24h)
- Job cleanup marca carrito como `abandoned`
- Próxima interacción crea nuevo carrito activo

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Migración crea tabla `carts` con campos id, customerId, merchantId, status, expiresAt, timestamps | test: verificar schema con `pnpm db:migrate` + query manual |
| AC-02 | Migración crea tabla `cart_items` con constraint unique (cartId, variantId) | test: `describe('CartItem unique constraint')` verifica error al insertar duplicado |
| AC-03 | `createOrGetActiveCart` retorna carrito existente si hay uno activo, o crea nuevo con expiresAt = now() + TTL | test: `CartService.spec.ts` `'should reuse active cart'` |
| AC-04 | `addItem` captura precio real desde ProductVariant.price en priceSnapshot | test: `'should snapshot price at add time'` verifica priceSnapshot === variant.price |
| AC-05 | `addItem` valida stock disponible antes de agregar | test: `'should reject if stock insufficient'` lanza error si quantity > variant.stock |
| AC-06 | `updateQuantity` ajusta cantidad de item existente (o remueve si qty=0) | test: `'should update quantity'` verifica cambio en DB |
| AC-07 | `removeItem` elimina item del carrito | test: `'should remove item'` verifica item no existe después |
| AC-08 | `getCartSummary` calcula subtotal por item y total general correctamente | test: `'should calculate totals'` verifica math |
| AC-09 | `clearCart` elimina todos items y marca status = abandoned | test: `'should clear cart'` verifica items.length = 0 y status = abandoned |
| AC-10 | CartFlow detecta "agregar X" → busca producto → agrega → responde confirmación con total | test: e2e `cart.e2e-spec.ts` `'should add item via conversation'` |
| AC-11 | CartFlow detecta "ver carrito" → responde con resumen formateado WhatsApp-friendly | test: e2e `'should show cart summary'` verifica formato de mensaje |
| AC-12 | CartFlow detecta "quitar X" → remueve item → responde confirmación | test: e2e `'should remove item via conversation'` |
| AC-13 | IntentRouter clasifica "agregar camiseta" como ADD_TO_CART con confidence > 0.7 | test: `IntentRouter.spec.ts` `'should detect ADD_TO_CART'` |
| AC-14 | IntentRouter clasifica "ver carrito" como SHOW_CART con confidence > 0.8 | test: `'should detect SHOW_CART'` |
| AC-15 | IntentRouter clasifica "quitar producto" como REMOVE_FROM_CART con confidence > 0.7 | test: `'should detect REMOVE_FROM_CART'` |
| AC-16 | Guardrail: priceSnapshot nunca es null y siempre viene de ProductVariant (no permitir precio manual) | test: `'should enforce price from variant'` verifica priceSnapshot source |
| AC-17 | Guardrail: stock validado antes de agregar (rechaza si insuficiente) | test: `'should validate stock'` mock variant.stock = 2, intenta agregar qty = 5 → error |
| AC-18 | TTL: cart.expiresAt seteado correctamente al crear (now() + env.CART_TTL_HOURS) | test: `'should set expiration on create'` verifica expiresAt timestamp |
| AC-19 | Job cleanup marca carritos expirados como abandoned (cron diario) | test: `CartCleanupService.spec.ts` `'should mark expired carts'` |

## Plan de pruebas

### Unit:
- `CartService.spec.ts`: todos los métodos CRUD (mock repositories)
- `CartFlow.spec.ts`: handlers conversacionales (mock CartService + CatalogService)
- `IntentRouter.spec.ts`: clasificación de nuevos intents
- `CartCleanupService.spec.ts`: job de expiración

### Integration:
- `cart.e2e-spec.ts`: flujo completo webhook → add → show → remove
  - Test 1: agregar item, verificar persistencia en DB
  - Test 2: mostrar carrito con múltiples items
  - Test 3: remover item, verificar eliminación
  - Test 4: validación de stock insuficiente
  - Test 5: carrito vacío (mensaje apropiado)

### Manual (si aplica):
- Conectar WhatsApp Test Number → enviar "quiero camiseta" → verificar respuesta conversacional coherente

## DoD

- [x] brief.md completo y en DRAFT
- [ ] Todos los AC tienen evidencia (post-implementación)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (Cart + CartItem tables)
- [ ] Idempotencia implementada vía constraint unique (cartId, variantId)
- [ ] Guardrails: precio desde variant.price, stock validado, no override manual
- [ ] PII minimizada (no se almacena info sensible en carrito)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migration incluida y exitosa (`pnpm db:migrate`)
- [ ] Tests e2e cubren flujo completo conversacional
- [ ] Respuestas en español, formato WhatsApp-friendly
- [ ] `.env.example` actualizado con `CART_TTL_HOURS`
- [ ] No hay endpoints HTTP REST (solo conversacional, preparar para PR-05 checkout)

## Constraints

- **Guardrails críticos**:
  - Precio siempre capturado desde ProductVariant.price (no inventado por usuario ni LLM)
  - Stock validado en tiempo real al agregar item
  - TTL respetado estrictamente (no permitir operaciones en carritos expirados)
  
- **PII**: Carrito no contiene datos sensibles (solo referencias a customer, merchant, variants)

- **Performance**: búsqueda de productos debe ser rápida para UX conversacional (<1s)

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Usuario especifica producto ambiguo ("camiseta") y hay 20 variantes | Confusión conversacional | Limitar resultados a top 5, pedir clarificación con opciones numeradas |
| Stock cambia entre agregar al carrito y checkout | Pedido rechazado en checkout | PR-05 re-valida stock en checkout (disclaimer en cart: "stock sujeto a disponibilidad") |
| Carrito expira mientras usuario está conversando | UX frustrante si pierde items | TTL generoso (24h default), mensaje claro si carrito expirado |
| Concurrencia: 2 requests agregan mismo item simultáneamente | Duplicate key error en unique constraint | Manejar error como "update quantity" (incrementar) |
| LLM malinterpreta "quitar X" y remueve item equivocado | Usuario pierde selección | Confirmación antes de remover ("¿Seguro que quieres quitar X?") - dejar para PR futura, MVP: asumir interpretación correcta |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| - | - | - |

---

**Status**: `APPROVED` — Issue [#70](https://github.com/ferbbo/closy-bot/issues/70) creado | Branch `PR-04-cart-crud-conversational` lista
