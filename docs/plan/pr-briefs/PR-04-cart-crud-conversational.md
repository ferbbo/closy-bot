# Brief — PR-04 — Carrito: CRUD conversacional persistido

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-04-cart-crud-conversational.md`
> **Issue**: [#72](https://github.com/ferbbo/closy-bot/issues/72)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Habilitar gestión conversacional de carrito de compras: crear carrito por customer/merchant, agregar/remover/actualizar cantidad de productos, mostrar resumen con subtotal, y aplicar TTL de expiración configurable.

## Scope fence

### ✅ Included

- Modelos Prisma: `Cart` + `CartItem` con relaciones a Customer, Merchant, ProductVariant
- `CartRepository` con CRUD + `findActiveByCustomerAndMerchant`
- `CartService` con lógica de negocio (validaciones de stock, multi-tenancy, expiración)
- Flujos conversacionales: add-to-cart, view-cart, update-cart-item, remove-from-cart
- Extender `IntentType` con: `ADD_TO_CART`, `VIEW_CART`, `UPDATE_CART`, `REMOVE_FROM_CART`
- Migración Prisma con índices (customerId, merchantId, status, expiresAt)
- Snapshot de precio al agregar item (guardrail: no inventar precios)
- TTL por defecto 24h (configurable por playbook)
- Tests unitarios (service, repository) + e2e (orchestrator flows)

### ❌ Excluded

- Checkout (es PR-05)
- Endpoints HTTP públicos (solo conversacional en este PR)
- Descuentos/cupones/promociones
- Validación de límites de cantidad por producto (regla simple: max 99 unidades/item)
- Carrito compartido entre múltiples customers
- Notificaciones proactivas de carrito abandonado (es PR posterior)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Modelos Cart y CartItem persistidos con relaciones FK y constraints | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-01, AC-02 |
| REQ-02 | CartRepository con métodos: create, findById, findActiveByCustomerAndMerchant, save, expire | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-03 |
| REQ-03 | CartService con addItem, removeItem, updateItemQuantity, getCart, expiración automática, validación de stock | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-04, AC-05, AC-06 |
| REQ-04 | AddToCartFlow: detectar producto por nombre/SKU, confirmar variante, agregar al carrito, responder con confirmación | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-07 |
| REQ-05 | ViewCartFlow: mostrar items, cantidades, precios snapshot, subtotal | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-08 |
| REQ-06 | UpdateCartItemFlow: cambiar cantidad de item existente (1-99) | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-09 |
| REQ-07 | RemoveFromCartFlow: eliminar item por nombre/posición | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-10 |
| REQ-08 | IntentRouter extendido con keywords para intents de carrito | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-11 |
| REQ-09 | Orquestador enruta intents de carrito a flows correspondientes | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-12 |
| REQ-10 | TTL configurable por playbook (default 24h), campo expiresAt en Cart | [#72](https://github.com/ferbbo/closy-bot/issues/72) | AC-13 |

## Paths a tocar (concretos)

- `prisma/schema.prisma` — agregar modelos Cart, CartItem
- `prisma/migrations/` — nueva migración
- `apps/api/src/persistence/repositories/cart.repository.ts` (nuevo)
- `apps/api/src/persistence/repositories/cart.repository.spec.ts` (nuevo)
- `apps/api/src/services/cart.service.ts` (nuevo)
- `apps/api/src/services/cart.service.spec.ts` (nuevo)
- `apps/api/src/services/services.module.ts` — registrar CartService
- `apps/api/src/orchestrator/flows/add-to-cart.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/add-to-cart.flow.spec.ts` (nuevo)
- `apps/api/src/orchestrator/flows/view-cart.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/view-cart.flow.spec.ts` (nuevo)
- `apps/api/src/orchestrator/flows/update-cart-item.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/update-cart-item.flow.spec.ts` (nuevo)
- `apps/api/src/orchestrator/flows/remove-from-cart.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/remove-from-cart.flow.spec.ts` (nuevo)
- `apps/api/src/orchestrator/intent/intent-router.service.ts` — agregar intents
- `apps/api/src/orchestrator/intent/intent-router.service.spec.ts` — tests intents
- `apps/api/src/orchestrator/conversation.orchestrator.ts` — agregar casos para nuevos intents
- `apps/api/src/orchestrator/conversation.orchestrator.spec.ts` — tests e2e flows
- `apps/api/src/orchestrator/orchestrator.module.ts` — registrar nuevos flows

## Contratos / Interfaces

### Persistencia (Prisma models)

```prisma
enum CartStatus {
  ACTIVE
  EXPIRED
  CONVERTED  // Cuando se convierte en Order
}

model Cart {
  id         String     @id @default(cuid())
  customerId String     @map("customer_id")
  merchantId String     @map("merchant_id")
  status     CartStatus @default(ACTIVE)
  expiresAt  DateTime   @map("expires_at")
  createdAt  DateTime   @default(now()) @map("created_at")
  updatedAt  DateTime   @updatedAt @map("updated_at")

  customer Customer   @relation(fields: [customerId], references: [id])
  merchant Merchant   @relation(fields: [merchantId], references: [id])
  items    CartItem[]

  @@map("carts")
  @@index([customerId, merchantId, status])
  @@index([expiresAt])
}

model CartItem {
  id            String   @id @default(cuid())
  cartId        String   @map("cart_id")
  variantId     String   @map("variant_id")
  quantity      Int
  priceSnapshot Decimal  @db.Decimal(10, 2) @map("price_snapshot")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id])

  @@unique([cartId, variantId])
  @@map("cart_items")
  @@index([cartId])
}
```

### CartService (métodos principales)

```typescript
interface AddItemDto {
  customerId: string;
  merchantId: string;
  variantId: string;
  quantity: number;
}

interface UpdateItemDto {
  cartId: string;
  variantId: string;
  quantity: number;
}

class CartService {
  async addItem(dto: AddItemDto): Promise<Cart>;
  async removeItem(cartId: string, variantId: string): Promise<Cart>;
  async updateItemQuantity(dto: UpdateItemDto): Promise<Cart>;
  async getActiveCart(customerId: string, merchantId: string): Promise<Cart | null>;
  async calculateSubtotal(cartId: string): Promise<number>;
  async expireOldCarts(): Promise<number>; // Job para cleanup
}
```

### Intent Types (extender enum)

```typescript
export type IntentType = 
  | 'SEARCH_PRODUCT' 
  | 'GREETING' 
  | 'HELP' 
  | 'UNKNOWN'
  | 'ADD_TO_CART'
  | 'VIEW_CART'
  | 'UPDATE_CART'
  | 'REMOVE_FROM_CART';
```

### Idempotencia

- **Key**: `(customerId, merchantId)` → 1 carrito ACTIVE por customer/merchant
- **Constraint**: cuando se agrega item con mismo variantId, se incrementa quantity (no se crea nuevo item)
- **Unique constraint**: `cart_items(cartId, variantId)` para evitar duplicados

## Comportamiento

### Happy path: Agregar item al carrito

1. Usuario envía: "Quiero 2 camisas rojas talla M"
2. IntentRouter clasifica como `ADD_TO_CART` con entity `query: "camisas rojas talla M"`
3. AddToCartFlow:
   - Busca producto en catálogo (reutiliza CatalogService)
   - Si hay 1 variante → agrega directamente
   - Si hay múltiples variantes → pide aclaración (talla/color)
4. CartService.addItem():
   - Busca/crea carrito ACTIVE para (customerId, merchantId)
   - Valida stock disponible >= quantity
   - Snapshot de precio actual desde ProductVariant
   - Agrega/incrementa CartItem
   - Setea expiresAt = now + TTL (24h default)
5. Responde: "✅ Agregué 2 x Camisa Roja M ($25.00) a tu carrito. Subtotal: $50.00"

### Happy path: Ver carrito

1. Usuario envía: "ver mi carrito"
2. IntentRouter → `VIEW_CART`
3. ViewCartFlow:
   - CartService.getActiveCart()
   - CartService.calculateSubtotal()
   - Formatea mensaje con lista items + subtotal
4. Responde:
   ```
   🛒 Tu carrito:
   
   1. Camisa Roja M x2 — $50.00
   2. Pantalón Negro L x1 — $35.00
   
   💰 Subtotal: $85.00
   
   Para proceder, escribe "pagar" o "checkout"
   ```

### Edge cases

#### Duplicados (mismo variantId)
- Si se agrega item ya existente → incrementa quantity (no crea CartItem duplicado)
- Constraint unique `(cartId, variantId)` previene race conditions

#### Stock insuficiente
- CartService valida stock antes de agregar
- Si stock < quantity → responde: "❌ Solo hay X unidades disponibles de Camisa Roja M"

#### Carrito expirado
- Job periódico marca como `EXPIRED` carritos con `expiresAt < now()`
- Al agregar item a carrito EXPIRED → crea nuevo carrito ACTIVE

#### Out-of-order / reintentos
- No aplica idempotencia estricta por dedupe key externo (no hay webhook)
- Unique constraint `(cartId, variantId)` previene duplicados via DB

#### Variante eliminada/desactivada
- CartItem mantiene variantIdFK ON DELETE RESTRICT (fail-fast)
- Checkout validará disponibilidad real al procesar orden

#### Precio cambia después de agregado
- CartItem.priceSnapshot preserva precio al momento de agregar
- Checkout puede recalcular con precios actuales y notificar diferencia

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Migración crea tablas `carts` y `cart_items` con relaciones FK correctas | test: `pnpm db:migrate` success + schema validación |
| AC-02 | Índices existen en (customerId, merchantId, status) y expiresAt | grep schema.prisma |
| AC-03 | CartRepository.findActiveByCustomerAndMerchant retorna carrito ACTIVE o null | test: `cart.repository.spec.ts` → `should return active cart` |
| AC-04 | CartService.addItem crea carrito si no existe, snapshot precio, valida stock | test: `cart.service.spec.ts` → `should create cart and add item with price snapshot` |
| AC-05 | CartService.addItem incrementa quantity si item ya existe (mismo variantId) | test: `cart.service.spec.ts` → `should increment quantity for existing item` |
| AC-06 | CartService.addItem lanza error si stock insuficiente | test: `cart.service.spec.ts` → `should throw error when insufficient stock` |
| AC-07 | AddToCartFlow agrega producto y responde con confirmación + subtotal | test: `add-to-cart.flow.spec.ts` → `should add item and return confirmation` |
| AC-08 | ViewCartFlow muestra items con formato WhatsApp + subtotal | test: `view-cart.flow.spec.ts` → `should format cart summary` |
| AC-09 | UpdateCartItemFlow cambia quantity de item existente (1-99) | test: `update-cart-item.flow.spec.ts` → `should update quantity` |
| AC-10 | RemoveFromCartFlow elimina item del carrito | test: `remove-from-cart.flow.spec.ts` → `should remove item` |
| AC-11 | IntentRouter clasifica "agregar al carrito" como ADD_TO_CART | test: `intent-router.service.spec.ts` → `should classify add to cart intent` |
| AC-12 | Orchestrator enruta ADD_TO_CART a AddToCartFlow y retorna respuesta | test: `conversation.orchestrator.spec.ts` → `should handle ADD_TO_CART intent` |
| AC-13 | Cart.expiresAt se setea a now + 24h por defecto al crear/actualizar | test: `cart.service.spec.ts` → `should set expiresAt to 24h from now` |

## Plan de pruebas

### Unit tests

- **CartRepository** (`cart.repository.spec.ts`):
  - create cart
  - findActiveByCustomerAndMerchant (con/sin carrito)
  - findById con items incluidos
  - save/update cart

- **CartService** (`cart.service.spec.ts`):
  - addItem: crear carrito + agregar
  - addItem: incrementar quantity (item existente)
  - addItem: error stock insuficiente
  - addItem: snapshot precio correcto
  - removeItem: eliminar item
  - updateItemQuantity: cambiar qty
  - calculateSubtotal: suma correcta
  - getActiveCart: retorna solo ACTIVE
  - multi-tenancy: no acceder carrito de otro merchant

- **Flows** (`*.flow.spec.ts`):
  - AddToCartFlow: happy path + múltiples variantes
  - ViewCartFlow: carrito vacío vs con items
  - UpdateCartItemFlow: qty válida
  - RemoveFromCartFlow: item existente

- **IntentRouter** (`intent-router.service.spec.ts`):
  - clasificación keywords ADD_TO_CART / VIEW_CART / UPDATE_CART / REMOVE_FROM_CART

### Integration (e2e)

- **ConversationOrchestrator** (`conversation.orchestrator.spec.ts`):
  - Flujo completo: búsqueda → agregar → ver carrito → actualizar qty → remover
  - Verificar respuesta WhatsApp formateada correctamente

### Manual (opcional)

- Webhook WhatsApp con mensajes: "busco camisa" → "agregar al carrito" → "ver carrito"
- Validar formato WhatsApp legible (emojis, saltos de línea)

## DoD

- [ ] Todos los AC tienen evidencia (tests pasan)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (carts + cart_items)
- [ ] Idempotencia: unique constraint (cartId, variantId) previene duplicados
- [ ] Guardrails: priceSnapshot desde ProductVariant (bot NO inventa precios)
- [ ] Guardrails: validación de stock >= quantity
- [ ] PII minimizada: solo customerId FK (nombre no se guarda en cart)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migración incluida con índices
- [ ] Documentación: actualizar BACKEND-EXECUTION-GUIDE.md con:
  - [ ] Explicación de modelos Cart/CartItem
  - [ ] Ejemplos de intents conversacionales
  - [ ] TTL y expiración (24h default)

## API Consumer-First

**Nota**: Este PR implementa API conversacional (WhatsApp), no endpoints HTTP públicos.

### Consumer Experience

**¿Cómo se consume?**
- Via mensajes WhatsApp (texto natural)
- Usuario envía: "Quiero 2 camisas rojas" → bot responde con confirmación

**Auth method:**
- Implícito: identity por WhatsApp phone number (customerId resuelto por MerchantResolverService)
- No requiere API key ni headers (es conversacional)

**Endpoints (conversacionales, no HTTP):**
- ADD_TO_CART: keywords → "agregar", "quiero", "añadir", "comprar"
- VIEW_CART: keywords → "ver carrito", "mi carrito", "qué tengo"
- UPDATE_CART: keywords → "cambiar cantidad", "actualizar", "modificar"
- REMOVE_FROM_CART: keywords → "quitar", "eliminar", "sacar del carrito"

**Testing:**
- No hay cURL examples (es conversacional)
- Tests e2e simulan webhook inbound con mensajes de texto
- Manual: enviar WhatsApp real al webhook configurado

**Errores accionables:**
- "❌ Solo hay X unidades disponibles" (stock insuficiente)
- "😔 No encontré ese producto" (item no existe)
- "🛒 Tu carrito está vacío" (VIEW_CART sin items)

## Constraints

- **Guardrails**: bot NO inventa precio (snapshot desde ProductVariant), NO inventa stock (valida antes de agregar)
- **PII**: minimizada, solo FK customerId (no almacenar nombre/dirección en cart)
- **Límites**: max 99 unidades por CartItem (validación simple)
- **Multi-tenancy**: carrito siempre filtrado por merchantId

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Race condition al agregar item simultáneo | Media | Medio | Unique constraint `(cartId, variantId)` + DB transaction |
| Stock cambia después de agregar al carrito | Alta | Bajo | Validar stock nuevamente en checkout (PR-05) |
| Usuario agrega 99 unidades de producto con stock 2 | Baja | Bajo | Validación CartService.addItem lanza error |
| Carrito expirado no se limpia automáticamente | Media | Bajo | Job periódico `expireOldCarts()` (implementar en PR posterior o este PR) |
| Múltiples variantes del mismo producto confunden al usuario | Media | Medio | AddToCartFlow pide aclaración si >1 variante match |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-23 | Status: DRAFT → APPROVED | Humano aprobó spec completa. Issue #72 creado, branch PR-04-cart-crud-conversational activa. |

