# Brief — PR-05 — Checkout: captura de datos + creación de orden + notificación merchant

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-05-checkout-order-creation.md`
> **Issue**: [#86](https://github.com/ferbbo/closy-bot/issues/86)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Habilitar checkout conversacional desde carrito activo, capturar datos mínimos del cliente (nombre, dirección), crear orden persistida con orderCode único por merchant, y notificar al merchant por WhatsApp con detalle del pedido. **100% template-first** — el LLM NO participa en el flujo de checkout.

## Scope fence

### ✅ Included

- Modelos Prisma: `Order` (con enum status), `OrderItem` (snapshot de producto)
- `CheckoutService`: lógica de flujo multi-step conversacional (stateful)
- `CheckoutFlow`: flow determinístico (template-first) que coordina captura de datos
- State persistence en `Conversation.metadata` (JSON field): estado de checkout + datos parciales
- Generación de `orderCode` secuencial por merchant (ej: `ORD-001`, `ORD-002`)
- Captura de datos mínimos: nombre, dirección, método de pago (selección desde MerchantConfig)
- Crear `Order` con status `pending_payment` + items con snapshot de precio
- Marcar `Cart` como `completed` al crear orden
- `MerchantNotificationService`: enviar WhatsApp al merchant con nuevo pedido (OutboxMessage)
- Intent nuevo: `CHECKOUT` (keywords: "quiero pagar", "checkout", "finalizar", "comprar")
- Tests unit (CheckoutService, orderCode generation) + e2e (flujo completo)
- Migración: crear tablas `orders` + `order_items` con índices
- Actualización de `BACKEND-EXECUTION-GUIDE.md` con ejemplos de cURL + flujo manual
- Consumer-first design: flujo testeable desde WhatsApp sandbox/mock

### ❌ Excluded

- Payment gateway integration (Stripe, MercadoPago, etc.) — eso es PR-06
- Shipping tracking (tracking number, provider integration) — eso es post-MVP
- Historial detallado de cambios de estado (audit log) — futuro
- Cupones/descuentos/promociones — futuro
- Validación de dirección (geocoding, autocompletar) — futuro
- UI dashboard de órdenes — eso es PR-FE-06
- Configuración de preguntas de checkout (cuáles campos pedir) — V1 tiene campos fijos (nombre, dirección, método de pago)
- Confirmación automática de pago (eso es PR-06 con webhook)
- Multi-step state machine formal (FSM library) — V1 usa state simple en metadata

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear modelos Prisma `Order` y `OrderItem` con relaciones | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-01, AC-02 |
| REQ-02 | Enum `OrderStatus` con valores: `pending_payment`, `confirmed`, `paid`, `shipped`, `delivered`, `cancelled` | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-01 |
| REQ-03 | Generador de `orderCode` secuencial por merchant (usa prefix de `MerchantConfig`) | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-03 |
| REQ-04 | `CheckoutService` con métodos: `startCheckout()`, `captureField()`, `createOrder()`, `getCheckoutState()` | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-04, AC-05 |
| REQ-05 | State persistence en `Conversation.metadata.checkout`: `{ step, data: { name?, address?, paymentMethod? } }` | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-06 |
| REQ-06 | `CheckoutFlow` (template-first) que ejecuta flujo conversacional multi-step | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-07, AC-08 |
| REQ-07 | Steps de checkout: (1) pedir nombre, (2) pedir dirección, (3) mostrar métodos de pago, (4) confirmación, (5) crear orden | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-08 |
| REQ-08 | Snapshot de precio y nombre de producto/variante en `OrderItem` (no depende de catálogo futuro) | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-09 |
| REQ-09 | Marcar `Cart.status = completed` al crear orden exitosamente | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-10 |
| REQ-10 | `MerchantNotificationService`: enviar WhatsApp al merchant con detalle de nuevo pedido | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-11 |
| REQ-11 | Intent `CHECKOUT` en `IntentRouter` con keywords (agregar a PR-03.5.1 intents) | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-12 |
| REQ-12 | Validación: no permitir checkout si carrito vacío | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-13 |
| REQ-13 | Tests unit (service logic, orderCode gen, state transitions) + e2e (flujo conversacional completo) | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-14, AC-15 |
| REQ-14 | Actualizar `BACKEND-EXECUTION-GUIDE.md` con Flujo 6: Checkout + cURL examples | [#86](https://github.com/ferbbo/closy-bot/issues/86) | AC-16 |

> **Nota**: Todos los REQs apuntan al mismo issue ([#86](https://github.com/ferbbo/closy-bot/issues/86)).

## Paths a tocar (concretos)

- `prisma/schema.prisma`: agregar modelos `Order`, `OrderItem`, enum `OrderStatus`
- `prisma/migrations/`: nueva migración `pr_05_add_order_models`
- `apps/api/src/domain/entities/`: `order.entity.ts`, `order-item.entity.ts` (interfaces TypeScript)
- `apps/api/src/services/`:
  - `checkout.service.ts` (crear): lógica de checkout multi-step
  - `checkout.service.spec.ts` (crear): tests unitarios
  - `merchant-notification.service.ts` (crear): notificaciones al merchant
  - `merchant-notification.service.spec.ts` (crear)
  - `services.module.ts`: registrar nuevos services
- `apps/api/src/orchestrator/flows/`:
  - `checkout.flow.ts` (crear): flow determinístico
  - `checkout.flow.spec.ts` (crear)
- `apps/api/src/orchestrator/flows/intent-router.ts`: agregar intent `CHECKOUT`
- `apps/api/src/persistence/prisma/`:
  - `order.repository.ts` (crear)
  - `order.repository.spec.ts` (crear)
- `apps/api/test/`: nuevos e2e tests
  - `checkout-flow.e2e-spec.ts`
- `docs/BACKEND-EXECUTION-GUIDE.md`: agregar Flujo 6 (Checkout)

## Contratos / Interfaces

### Persistencia (Prisma)

#### OrderStatus enum
| Value | Descripción |
|-------|-------------|
| `pending_payment` | Orden creada, esperando confirmación de pago |
| `confirmed` | Orden confirmada por merchant (COD) o pago recibido |
| `paid` | Pago confirmado (webhook o comando manual) |
| `shipped` | Orden enviada (tracking future) |
| `delivered` | Orden entregada (confirmación manual o automática) |
| `cancelled` | Orden cancelada (merchant o cliente) |

#### Order model
| Field | Type | Constraints | Descripción |
|-------|------|-------------|-------------|
| `id` | String | PK, cuid | Identificador único |
| `orderCode` | String | unique per merchant | Código legible (ORD-001) |
| `merchantId` | String | FK → Merchant | Dueño del pedido |
| `customerId` | String | FK → Customer | Cliente que compra |
| `status` | OrderStatus | default: pending_payment | Estado actual |
| `totalAmount` | Decimal(10,2) | required | Total calculado (suma items + envío) |
| `shippingAddress` | String | required | Dirección de entrega |
| `customerName` | String | required | Nombre del cliente |
| `customerPhone` | String | required | Teléfono (del Customer) |
| `paymentMethod` | String | required | Método elegido (cod/transfer/payment_link) |
| `notes` | String? | optional, @db.Text | Notas adicionales del cliente |
| `shippingCost` | Decimal(10,2) | default: 0 | Costo de envío (si aplica) |
| `createdAt` | DateTime | auto | Fecha de creación |
| `updatedAt` | DateTime | auto | Última actualización |

**Relaciones:**
- `merchant`: Merchant (1:N)
- `customer`: Customer (1:N)
- `items`: OrderItem[] (1:N cascade delete)

**Índices:**
- `orderCode, merchantId` (unique compound)
- `customerId`
- `merchantId, status`
- `createdAt DESC`

#### OrderItem model
| Field | Type | Constraints | Descripción |
|-------|------|-------------|-------------|
| `id` | String | PK, cuid | Identificador único |
| `orderId` | String | FK → Order | Orden padre |
| `variantId` | String | FK → ProductVariant | Variante comprada |
| `quantity` | Int | required, > 0 | Cantidad |
| `unitPrice` | Decimal(10,2) | required | Precio unitario (snapshot) |
| `snapshotName` | String | required | Nombre producto + variante (snapshot) |
| `createdAt` | DateTime | auto | Fecha de creación |

**Relaciones:**
- `order`: Order (N:1 cascade)
- `variant`: ProductVariant (N:1)

**Índices:**
- `orderId`

### Endpoints

> **Nota**: Este PR NO agrega endpoints HTTP REST. El flujo de checkout es 100% conversacional (via WhatsApp). La interacción es:
> Cliente → WhatsApp mensaje → Webhook → Orchestrator → CheckoutFlow → respuestas WhatsApp → OutboxMessage

**Consumer Experience:**
- **UI perspective**: No hay UI en este PR. Merchant recibe notificación por WhatsApp (mensaje texto con detalle del pedido).
- **cURL testability**: Se puede probar enviando webhooks inbound simulados (POST `/webhooks/whatsapp`) con mensajes del flujo de checkout.
- **Auth method**: N/A para checkout flow (es conversacional). MerchantNotification usa credenciales del `Channel` (patrón de PR-03.11).

### DTOs / payloads

#### CheckoutState (TypeScript interface — metadata JSON)
```typescript
{
  step: 'ASK_NAME' | 'ASK_ADDRESS' | 'SELECT_PAYMENT' | 'CONFIRM' | 'COMPLETED',
  data: {
    name?: string,
    address?: string,
    paymentMethod?: string  // 'cod' | 'transfer' | 'payment_link'
  },
  startedAt: string,  // ISO timestamp
  cartId: string
}
```

#### CreateOrderDto (TypeScript — interno service)
```typescript
{
  merchantId: string,
  customerId: string,
  cartId: string,
  customerName: string,
  shippingAddress: string,
  paymentMethod: string,
  notes?: string
}
```

#### MerchantNotificationPayload (TypeScript — interno)
```typescript
{
  type: 'NEW_ORDER',
  orderCode: string,
  customerName: string,
  totalAmount: string,  // formatted COP $X
  items: Array<{ name: string, qty: number, price: string }>,
  shippingAddress: string,
  paymentMethod: string
}
```

### Idempotencia

- **Key**: No aplica idempotencia externa (no webhook duplicado). El checkout es stateful dentro de la conversación.
- **Constraint**: `orderCode` es único por merchant (compound unique `orderCode + merchantId`).
- **Comportamiento**: Si usuario reinicia checkout a mitad (dice "quiero pagar" de nuevo), el state anterior se resetea y comienza flujo nuevo. Cart anterior se mantiene `active` hasta completar.

## Comportamiento

### Happy path

1. Cliente tiene carrito activo con 2 items
2. Cliente envía mensaje: "quiero pagar"
3. IntentRouter detecta `CHECKOUT` intent → ruta a `CheckoutFlow`
4. CheckoutFlow:
   - **Step 1**: Bot pregunta: "¿Cuál es tu nombre completo?"
   - Cliente responde: "Juan Pérez"
   - State: `{ step: 'ASK_ADDRESS', data: { name: 'Juan Pérez' } }`
   - **Step 2**: Bot pregunta: "¿Cuál es tu dirección de entrega?"
   - Cliente responde: "Calle 123 #45-67, Bogotá"
   - State: `{ step: 'SELECT_PAYMENT', data: { name, address } }`
   - **Step 3**: Bot muestra métodos de pago desde `MerchantConfig.paymentMethods`:
     - "Selecciona tu método de pago:\n1. Contraentrega\n2. Transferencia bancaria\nResponde con el número."
   - Cliente responde: "1"
   - State: `{ step: 'CONFIRM', data: { name, address, paymentMethod: 'cod' } }`
   - **Step 4**: Bot muestra resumen:
     - "Confirma tu pedido:\n- Items: 2\n- Total: $120,000\n- Dirección: Calle 123...\n- Método: Contraentrega\n\nResponde 'confirmar' para finalizar."
   - Cliente responde: "confirmar"
   - **Step 5 (finalización)**:
     - `CheckoutService.createOrder()`:
       - Genera `orderCode` (ej: `ORD-001`)
       - Crea `Order` con status `pending_payment`
       - Crea `OrderItem[]` con snapshots de `CartItem[]`
       - Marca `Cart.status = completed`
       - Actualiza `Conversation.metadata.checkout.step = 'COMPLETED'`
     - `MerchantNotificationService.notifyNewOrder()`:
       - Enqueue `OutboxMessage` al merchant:
         - "🔔 Nuevo pedido ORD-001\n👤 Juan Pérez\n📍 Calle 123 #45-67\n💵 Total: $120,000\n💳 Contraentrega\n\nItems:\n- Producto A (Talla M) x2: $60,000\n- Producto B x1: $60,000"
     - Bot responde al cliente:
       - "✅ Tu pedido ORD-001 ha sido registrado. Te contactaremos pronto para confirmar. ¡Gracias!"
5. Merchant recibe notificación en su WhatsApp
6. Order queda en DB con status `pending_payment`

### Edge cases

#### Carrito vacío
- Cliente dice "quiero pagar" pero carrito está vacío o no existe
- Bot responde: "Tu carrito está vacío. Primero busca productos y agrégalos con 'agregar [producto]'."
- No inicia checkout

#### Cliente abandona checkout a mitad
- Cliente está en step `ASK_ADDRESS`, pero envía otro intent (ej: "buscar zapatos")
- State de checkout se resetea (o se mantiene con TTL)
- Cliente puede reintentar checkout después (comienza desde step 1)

#### Método de pago inválido
- Cliente responde con texto que no matchea opciones (ej: "paypal")
- Bot repite opciones: "Por favor selecciona una opción válida (1, 2, ...)"
- Max 3 intentos → cancela checkout con mensaje: "Checkout cancelado. Intenta 'quiero pagar' de nuevo."

#### Merchant sin phone
- Al intentar notificar, si `merchant.phone` es null → log warning, skip notification (no crash)
- Order se crea igual

#### Reintentos de confirmación
- Si `CheckoutService.createOrder()` falla (DB error, constraint violation):
  - Bot responde: "Hubo un error al procesar tu pedido. Intenta de nuevo en un momento."
  - State NO se marca como `COMPLETED`
  - Cliente puede re-confirmar

#### OrderCode collision
- Si por algún motivo `orderCode` ya existe (race condition):
  - Prisma lanza `UniqueConstraintViolation`
  - Retry con siguiente secuencia (max 3 retries)
  - Si falla → log error + respuesta genérica

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Migración crea tablas `orders` y `order_items` con enum `OrderStatus` | Migración aplicada sin errores en `pnpm db:migrate` |
| AC-02 | Relaciones FK correctas (Order → Customer, Merchant; OrderItem → Order, Variant) | Schema Prisma validado + migración con constraints |
| AC-03 | `orderCode` se genera secuencial por merchant (usa prefix de `MerchantConfig.orderCodePrefix`) | Test unit `checkout.service.spec.ts`: `should generate sequential orderCode per merchant` |
| AC-04 | `CheckoutService.startCheckout()` valida carrito vacío y retorna error | Test unit: `should reject checkout if cart is empty` |
| AC-05 | `CheckoutService.captureField()` actualiza state en `Conversation.metadata.checkout` | Test unit: `should persist checkout state in conversation metadata` |
| AC-06 | State persiste entre mensajes (conversación multi-step) | Test e2e: `should maintain checkout state across multiple messages` |
| AC-07 | `CheckoutFlow` ejecuta steps en orden correcto (ASK_NAME → ASK_ADDRESS → SELECT_PAYMENT → CONFIRM) | Test e2e: `checkout-flow.e2e-spec.ts`: `should complete checkout with valid responses` |
| AC-08 | Bot muestra métodos de pago desde `MerchantConfig.paymentMethods` | Test e2e: verificar mensaje contiene labels de payment methods |
| AC-09 | `OrderItem[]` captura snapshot de `unitPrice` y `snapshotName` (no depende de catálogo futuro) | Test unit: `should snapshot price and name from CartItem` |
| AC-10 | `Cart.status` cambia a `completed` al crear orden exitosamente | Test e2e: verificar `cart.status === 'completed'` post-checkout |
| AC-11 | `MerchantNotificationService` enqueue mensaje a merchant con detalle de pedido | Test unit: `should enqueue notification to merchant with order details` |
| AC-12 | Intent `CHECKOUT` detectado por `IntentRouter` con keywords | Test unit `intent-router.spec.ts`: `should classify 'quiero pagar' as CHECKOUT with HIGH confidence` |
| AC-13 | Checkout rechazado si carrito vacío con mensaje apropiado | Test e2e: `should reject checkout if cart is empty` |
| AC-14 | Tests unit cubren: orderCode generation, state transitions, field capture, snapshots | Coverage > 80% en `checkout.service.ts` |
| AC-15 | Test e2e cubre flujo completo: inicio → captura nombre → dirección → pago → confirmación → orden creada + notificación | `checkout-flow.e2e-spec.ts` con test `should complete full checkout flow and create order` |
| AC-16 | `BACKEND-EXECUTION-GUIDE.md` actualizado con Flujo 6: Checkout (descripción + cURL examples simulados) | Doc contiene sección "Flujo 6: Checkout conversacional" con ejemplos |

## Plan de pruebas

### Unit tests

**CheckoutService** (`checkout.service.spec.ts`):
- `should generate sequential orderCode per merchant` (REQ-03, AC-03)
- `should reject checkout if cart is empty` (REQ-12, AC-04, AC-13)
- `should persist checkout state in conversation metadata` (REQ-05, AC-05, AC-06)
- `should capture and validate customer name` (REQ-04)
- `should capture and validate shipping address` (REQ-04)
- `should validate selected payment method against MerchantConfig` (REQ-07)
- `should create Order with correct status and snapshot data` (REQ-01, REQ-08, AC-09)
- `should mark Cart as completed after order creation` (REQ-09, AC-10)
- `should handle orderCode collision with retry` (AC-03)

**MerchantNotificationService** (`merchant-notification.service.spec.ts`):
- `should enqueue notification to merchant with order details` (REQ-10, AC-11)
- `should format notification message correctly` (REQ-10)
- `should skip notification if merchant.phone is null` (Edge case)

**IntentRouter** (`intent-router.spec.ts`):
- `should classify 'quiero pagar' as CHECKOUT with HIGH confidence` (REQ-11, AC-12)
- `should classify 'checkout' as CHECKOUT` (REQ-11)

**CheckoutFlow** (`checkout.flow.spec.ts`):
- `should start checkout and ask for name` (REQ-06)
- `should transition from ASK_NAME to ASK_ADDRESS` (REQ-07)
- `should show payment methods from MerchantConfig` (REQ-07, AC-08)
- `should handle invalid payment selection` (Edge case)
- `should show confirmation summary before creating order` (REQ-07)

### Integration tests (e2e)

**checkout-flow.e2e-spec.ts**:
- `should complete full checkout flow and create order` (AC-15):
  1. Setup: crear merchant con MerchantConfig, customer, cart con 2 items
  2. Enviar mensaje: "quiero pagar"
  3. Recibir pregunta: nombre
  4. Responder: "Test User"
  5. Recibir pregunta: dirección
  6. Responder: "Test Address 123"
  7. Recibir opciones de pago
  8. Responder: "1" (método válido)
  9. Recibir resumen + confirmación
  10. Responder: "confirmar"
  11. Verificar: Order creada con orderCode, status=pending_payment
  12. Verificar: OrderItems creados con snapshots
  13. Verificar: Cart.status=completed
  14. Verificar: OutboxMessage enqueued al merchant
- `should maintain checkout state across multiple messages` (AC-06)
- `should reject checkout if cart is empty` (AC-13)
- `should handle invalid payment method selection with retries` (Edge case)
- `should cancel checkout after 3 invalid attempts` (Edge case)

### Manual testing (opcional)

- Probar flujo completo desde WhatsApp sandbox/ngrok con merchant y customer reales
- Verificar que merchant recibe notificación en su WhatsApp
- Verificar que orderCode es legible y secuencial

## DoD

- [ ] Todos los AC tienen evidencia documentada
- [ ] Sin scope creep (solo lo del brief)
- [ ] Modelos `Order` y `OrderItem` persistidos en Postgres (migración aplicada)
- [ ] State de checkout persistido en `Conversation.metadata` (JSON)
- [ ] Checkout es 100% template-first (no LLM en el flujo, solo mensajes determinísticos)
- [ ] Guardrails: bot NO inventa precio/stock — usa snapshots de `CartItem`
- [ ] PII minimizada: solo nombre, dirección, teléfono (ya en Customer)
- [ ] `pnpm lint` pasa sin errores
- [ ] `pnpm test` pasa con coverage > 80% en servicios clave
- [ ] `pnpm db:migrate` aplica migración sin errores
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con Flujo 6 + cURL examples (AC-16)

## Constraints

- **Guardrails**: El bot NO inventa precio/stock/disponibilidad. Precio viene de snapshot en `CartItem` (ya capturado en PR-04).
- **PII**: Minimizar logs. No loggear dirección/nombre completo en logs de aplicación (solo IDs). Permitir en DB (necesario para operación).
- **Template-first**: Checkout es 100% determinístico. Mensajes de cada step (preguntas, confirmaciones, errores) son strings fijos en el flow, NO generados por LLM.
- **State TTL**: State de checkout en metadata no tiene TTL automático (se mantiene hasta completar o resetear manualmente). Cleanup futuro con job si es necesario.
- **MerchantNotification**: Usa infraestructura de `OutboxMessage` (patrón PR-03.9). No envío directo.

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-----------|
| OrderCode collision en concurrencia | Baja | Alto | Retry con siguiente secuencia (max 3 retries) + unique constraint DB |
| Cliente abandona checkout a mitad | Media | Bajo | State se resetea al reiniciar. No bloquea próximos checkouts. TTL futuro si es necesario. |
| Merchant no recibe notificación (phone null) | Baja | Medio | Log warning, skip notification. Order se crea igual. UI futura mostrará pedidos pendientes. |
| DB error al crear Order | Baja | Alto | Manejo de excepción, mensaje genérico al cliente, retry manual disponible. |
| Método de pago inválido por user typo | Media | Bajo | Validación + max 3 retries con mensaje claro. Si falla → cancela checkout. |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| | | |
