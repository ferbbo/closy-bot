# Brief — PR-06 — Pagos: webhook idempotente + fallback comando `PAGADO`

> **Status**: `DRAFT`
> **Archivo**: `docs/plan/pr-briefs/PR-06-payment-confirmation.md`
> **Issue**: TBD (se creará post-BRIEF GATE)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Confirmar pagos mediante webhook idempotente (dedupe por `payment_intent_id`) y fallback conversacional (`PAGADO`), transicionando Order de `pending_payment` → `paid` exactamente una vez, y notificando al merchant.

## Scope fence

### ✅ Included

- Modelo Prisma: `Payment` con constraint unique en `paymentIntentId`
- `PaymentService`: `confirmPayment()`, `processWebhook()`, `processFallbackCommand()`
- Webhook endpoint: `POST /webhooks/payments` con signature validation (HMAC configurable)
- Idempotencia: constraint DB-level → retry safe
- Fallback conversacional: cliente envía `"PAGADO"` → bot pide confirmar → Payment created
- Transición `Order.status`: `pending_payment` → `paid` exactamente una vez
- Notificación al merchant vía `MerchantNotificationService`
- Intent nuevo: `CONFIRM_PAYMENT` (keywords: "pagado", "pague", "transferí", "transferi", "ya pagué")
- `PaymentFallbackFlow`: flow conversacional para confirmar pago manual
- Tests unit (idempotencia, state transitions, dedupe) + e2e (webhook duplicado, fallback command)
- Migración: crear tabla `payments` con índices
- Actualización de `BACKEND-EXECUTION-GUIDE.md` con webhook signature + cURL examples
- Consumer-first design: webhook testeable con cURL + signature validation documentada

### ❌ Excluded

- Múltiples payment gateways (Stripe, MercadoPago) — V1 solo soporta webhook genérico + fallback manual
- Partial payments (pagos parciales) — V1 solo full amount
- Refunds (devoluciones de dinero) — post-MVP
- Conciliación avanzada (reconciliation reports) — post-MVP
- Manejo de moneda múltiple — V1 solo COP
- Payment links generation (Wompi, PayU) — se integra en PR-06.1 si es necesario
- UI dashboard de pagos — eso es PR-FE-06

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear modelo Prisma `Payment` con campos: orderId, amount, method, status, externalId, paymentIntentId (unique), confirmedAt | TBD | AC-01 |
| REQ-02 | Enum `PaymentStatus` con valores: `pending`, `confirmed`, `failed` | TBD | AC-01 |
| REQ-03 | `PaymentService.confirmPayment()`: crear Payment + transicionar Order status de `pending_payment` → `paid` (idempotente) | TBD | AC-02, AC-03 |
| REQ-04 | Webhook endpoint `POST /webhooks/payments` con signature validation (HMAC SHA-256 configurable) | TBD | AC-04, AC-05 |
| REQ-05 | `PaymentService.processWebhook()`: parsear payload, validar signature, procesar confirmación (idempotente por `paymentIntentId`) | TBD | AC-06, AC-07 |
| REQ-06 | Idempotencia: constraint unique en `paymentIntentId` → retry webhook seguro (200 OK sin efecto si ya procesado) | TBD | AC-08 |
| REQ-07 | Intent `CONFIRM_PAYMENT` en `IntentRouter` con keywords | TBD | AC-09 |
| REQ-08 | `PaymentFallbackFlow`: cliente envía "PAGADO" → bot pide confirmar order → crea Payment con `paymentIntentId = manual_{orderId}_{timestamp}` | TBD | AC-10, AC-11 |
| REQ-09 | Notificación al merchant: "Pago confirmado para ORD-XXX" (via `MerchantNotificationService`) | TBD | AC-12 |
| REQ-10 | Validación: no permitir confirmar pago si Order ya está en status `paid` (graceful fallback) | TBD | AC-13 |
| REQ-11 | Env vars: `PAYMENT_WEBHOOK_SECRET` (para signature validation), `PAYMENT_WEBHOOK_HEADER` (default: `X-Payment-Signature`) | TBD | AC-14 |
| REQ-12 | Tests unit (service logic, idempotencia, state transitions) + e2e (webhook duplicado, fallback, signature validation) | TBD | AC-15, AC-16 |
| REQ-13 | Actualizar `BACKEND-EXECUTION-GUIDE.md` con Flujo 7: Payments + webhook signature + cURL examples | TBD | AC-17 |

> **Nota**: Todos los REQs apuntarán al mismo issue (se creará post-BRIEF GATE).

## Paths a tocar (concretos)

- `prisma/schema.prisma`: agregar modelo `Payment`, enum `PaymentStatus`
- `prisma/migrations/`: nueva migración `pr_06_add_payment_models`
- `apps/api/src/domain/entities/`: `payment.entity.ts` (interface TypeScript)
- `apps/api/src/services/`:
  - `payment.service.ts` (crear): lógica de confirmación + webhook processing
  - `payment.service.spec.ts` (crear): tests unitarios
  - `services.module.ts`: registrar `PaymentService`
- `apps/api/src/channels/webhooks/`:
  - `payment-webhook.controller.ts` (crear): endpoint `/webhooks/payments`
  - `payment-webhook.controller.spec.ts` (crear)
- `apps/api/src/orchestrator/flows/`:
  - `payment-fallback.flow.ts` (crear): flow conversacional para comando PAGADO
  - `payment-fallback.flow.spec.ts` (crear)
- `apps/api/src/orchestrator/flows/intent-router.ts`: agregar intent `CONFIRM_PAYMENT`
- `apps/api/src/persistence/prisma/`:
  - `payment.repository.ts` (crear)
  - `payment.repository.spec.ts` (crear)
- `apps/api/test/`: nuevos e2e tests
  - `payment-webhook.e2e-spec.ts`
  - `payment-fallback-flow.e2e-spec.ts`
- `docs/BACKEND-EXECUTION-GUIDE.md`: agregar Flujo 7 (Payments)
- `.env.example`: agregar `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_HEADER`

## Contratos / Interfaces

### Persistencia (Prisma)

#### PaymentStatus enum
| Value | Descripción |
|-------|-------------|
| `pending` | Pago iniciado, esperando confirmación |
| `confirmed` | Pago confirmado (webhook o comando manual) |
| `failed` | Pago fallido (webhook con status failed) |

#### Payment model

| Field | Type | Constraints | Descripción |
|-------|------|-------------|-------------|
| `id` | String | PK, cuid | Identificador único |
| `orderId` | String | FK → Order | Orden asociada |
| `amount` | Decimal(10,2) | required | Monto del pago |
| `method` | String | required | Método (cod/transfer/payment_link) |
| `status` | PaymentStatus | default: pending | Estado actual |
| `externalId` | String? | optional | ID del gateway (si aplica) |
| `paymentIntentId` | String | unique | Deduplication key (idempotencia) |
| `confirmedAt` | DateTime? | optional | Timestamp de confirmación |
| `metadata` | Json? | optional | Metadata adicional del webhook |
| `createdAt` | DateTime | auto | Fecha de creación |
| `updatedAt` | DateTime | auto | Última actualización |

**Relaciones:**
- `order`: Order (N:1)

**Índices:**
- `paymentIntentId` (unique — DB-level idempotency)
- `orderId`
- `status`

### Endpoints

#### POST /webhooks/payments

**Consumer Experience:**
- **UI perspective**: No hay UI para merchants. El webhook es consumido por payment gateways (Wompi, PayU, Stripe, etc.)
- **cURL testability**: Se puede probar con cURL enviando payload simulado + signature HMAC. Documentado en BACKEND-EXECUTION-GUIDE.md
- **Auth method**: HMAC SHA-256 signature validation (header `X-Payment-Signature` configurable)

**Request**:
```typescript
Content-Type: application/json
X-Payment-Signature: sha256=<HMAC-SHA256-hex>

{
  "payment_intent_id": "pi_1234567890",  // Deduplication key
  "order_code": "ORD-001",
  "amount": 120000,
  "status": "approved" | "rejected",
  "method": "transfer" | "payment_link",
  "external_id": "ext_xyz123",
  "timestamp": "2026-02-24T10:30:00Z",
  "metadata": { ... }  // Free-form adicional
}
```

**Response (success)**:
```typescript
200 OK
{
  "success": true,
  "payment_id": "clxxxxx",
  "order_code": "ORD-001",
  "status": "confirmed"
}
```

**Response (idempotent retry)**:
```typescript
200 OK
{
  "success": true,
  "payment_id": "clxxxxx",  // Same ID
  "order_code": "ORD-001",
  "status": "confirmed",
  "message": "Payment already processed"
}
```

**Response (signature invalid)**:
```typescript
401 Unauthorized
{
  "success": false,
  "error": "Invalid signature"
}
```

**Response (order not found)**:
```typescript
404 Not Found
{
  "success": false,
  "error": "Order not found"
}
```

**Response (order already paid)**:
```typescript
200 OK  // Graceful — no error
{
  "success": true,
  "payment_id": "<existing-payment-id>",
  "order_code": "ORD-001",
  "status": "confirmed",
  "message": "Order already paid"
}
```

### DTOs / payloads

#### PaymentWebhookDto (TypeScript — request payload)

| Field | Type | Required | Descripción |
|-------|------|----------|-------------|
| `payment_intent_id` | string | ✅ | Deduplication key (único por pago) |
| `order_code` | string | ✅ | Código de orden (ej: ORD-001) |
| `amount` | number | ✅ | Monto en centavos o unidad mínima |
| `status` | `'approved' \| 'rejected'` | ✅ | Estado del pago |
| `method` | string | ✅ | Método de pago |
| `external_id` | string | ❌ | ID del gateway externo |
| `timestamp` | string (ISO) | ✅ | Timestamp del evento |
| `metadata` | object | ❌ | Metadata adicional |

#### ConfirmPaymentDto (TypeScript — interno service)

| Field | Type | Descripción |
|-------|------|-------------|
| `orderId` | string | ID interno de Order |
| `amount` | number | Monto a confirmar |
| `method` | string | Método de pago |
| `paymentIntentId` | string | Deduplication key |
| `externalId` | string? | ID del gateway |
| `metadata` | object? | Additional data |

#### MerchantPaymentNotification (TypeScript — interno)

| Field | Type | Descripción |
|-------|------|-------------|
| `type` | `'PAYMENT_CONFIRMED'` | Tipo de notificación |
| `orderCode` | string | Código de orden |
| `amount` | string | Monto formateado (ej: "$120,000") |
| `method` | string | Método de pago |
| `timestamp` | string | Timestamp confirmación |

### Idempotencia

- **Key**: `paymentIntentId` (único a nivel DB con constraint)
- **Constraint**: `@@unique([paymentIntentId])`
- **Estrategia**:
  1. Webhook recibido → parsear `payment_intent_id`
  2. Check: `Payment` con ese `paymentIntentId` ya existe? → SI: retornar 200 OK con mensaje "already processed"
  3. NO: crear `Payment` + transicionar `Order` → `paid`
  4. Si otro request concurrente intenta crear mismo `paymentIntentId` → Prisma lanza `UniqueConstraintViolation` → catch + retorna 200 OK (idempotente)
- **Fallback manual**: `paymentIntentId = "manual_{orderId}_{timestamp_ms}"` → garantiza unicidad para pagos manuales

## Comportamiento

### Happy path (webhook)

1. Payment gateway confirma pago externo
2. Gateway envía POST a `/webhooks/payments`:
   ```json
   {
     "payment_intent_id": "pi_abc123",
     "order_code": "ORD-001",
     "amount": 120000,
     "status": "approved",
     "method": "transfer",
     "timestamp": "2026-02-24T10:30:00Z"
   }
   ```
3. Backend:
   - Valida signature HMAC → OK
   - Busca Order por `orderCode` + `merchantId` (resuelve desde gateway config o header)
   - Check: `Payment` con `paymentIntentId = "pi_abc123"` ya existe? → NO
   - Crea `Payment` con status `confirmed`
   - Transiciona `Order.status`: `pending_payment` → `paid`
   - `PaymentService.confirmPayment()` llama `MerchantNotificationService.notifyPaymentConfirmed()`
   - Merchant recibe WhatsApp: "✅ Pago confirmado para ORD-001\n💵 $120,000\n💳 Transferencia bancaria"
4. Response 200 OK

### Happy path (fallback conversacional)

1. Cliente hace transferencia bancaria (offline)
2. Cliente envía mensaje por WhatsApp: "Ya pagué"
3. IntentRouter detecta `CONFIRM_PAYMENT` intent → ruta a `PaymentFallbackFlow`
4. Bot: "¿Para qué pedido realizaste el pago? Responde con el código (ej: ORD-001)"
5. Cliente: "ORD-001"
6. Bot verifica:
   - Order existe? ✅
   - Order pertenece al customer? ✅
   - Order status = `pending_payment`? ✅
7. Bot: "Confirma que realizaste el pago de $120,000 para ORD-001. Responde 'confirmar' o 'cancelar'."
8. Cliente: "confirmar"
9. Backend:
   - Crea `Payment` con `paymentIntentId = "manual_ORD-001_1708775400000"`
   - Transiciona Order → `paid`
   - Notifica merchant: "✅ Pago confirmado (manual) para ORD-001\n💵 $120,000\n⚠️ Verifica transferencia bancaria"
10. Bot responde: "✅ Pago registrado para ORD-001. El vendedor verificará tu transferencia pronto."

### Edge cases

#### Webhook duplicado (retry)
- Gateway reenvía mismo `payment_intent_id` (retry policy)
- Backend:
  - `Payment` con ese ID ya existe → 200 OK sin crear duplicado
  - Response: `{ "success": true, "message": "Payment already processed" }`
- Orden NO se transiciona de nuevo (ya está en `paid`)

#### Signature inválida
- Webhook sin header `X-Payment-Signature` o HMAC incorrecto
- Backend: 401 Unauthorized
- Log: structured warning (no crash)

#### Order no encontrada
- Webhook con `order_code` inexistente
- Backend: 404 Not Found
- Log: structured warning

#### Order ya paid
- Webhook llega después de que orden ya fue confirmada (ej: fallback manual procesado primero)
- Backend: 200 OK sin error (graceful)
- Response: `{ "success": true, "message": "Order already paid" }`
- NO crea Payment duplicado

#### Cliente confirma pago para orden que no existe (fallback)
- Bot: "No encontré el pedido ORD-999. Verifica el código."

#### Cliente cancela confirmación (fallback)
- Bot: "Confirmación cancelada. Si ya pagaste, escribe 'pagado' de nuevo."

#### Monto en webhook no coincide con Order.totalAmount
- Backend: log warning (discrepancia) pero procesa igual (MVP — reconciliación post-payment)
- En V2 se puede agregar validación estricta

#### Concurrencia (2 webhooks simultáneos mismo paymentIntentId)
- Ambos intentan crear Payment
- Prisma: `UniqueConstraintViolation` en segundo request
- Catch error → 200 OK con mensaje "already processed"

#### Fallback manual duplicado (cliente envía "PAGADO" dos veces)
- Segundo intento: Order ya en status `paid`
- Bot: "Tu pedido ORD-001 ya fue confirmado como pagado. No necesitas hacer nada más."

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Migración crea tabla `payments` con enum `PaymentStatus` y constraint unique en `paymentIntentId` | Migración aplicada sin errores en `pnpm db:migrate` |
| AC-02 | `PaymentService.confirmPayment()` crea Payment y transiciona Order de `pending_payment` → `paid` | Test unit: `should create payment and transition order status to paid` |
| AC-03 | Idempotencia: llamar `confirmPayment()` dos veces con mismo `paymentIntentId` NO duplica Payment ni transiciona Order dos veces | Test unit: `should be idempotent - same paymentIntentId does not duplicate` |
| AC-04 | Endpoint `POST /webhooks/payments` existe y acepta payload JSON | Test e2e: `should accept webhook POST request` |
| AC-05 | Webhook valida signature HMAC SHA-256 (header `X-Payment-Signature`) → signature inválida retorna 401 | Test e2e: `should reject webhook with invalid signature` |
| AC-06 | `PaymentService.processWebhook()` parsea payload, extrae `payment_intent_id`, y llama `confirmPayment()` | Test unit: `should process webhook and confirm payment` |
| AC-07 | Webhook con `status: 'rejected'` NO confirma pago (solo registra Payment con status `failed`) | Test unit: `should not confirm payment if webhook status is rejected` |
| AC-08 | Webhook duplicado (mismo `payment_intent_id`) retorna 200 OK con mensaje "already processed" sin crash | Test e2e: `should handle duplicate webhook idempotently` |
| AC-09 | Intent `CONFIRM_PAYMENT` detectado por `IntentRouter` con keywords ("pagado", "pague", "transferí") | Test unit `intent-router.spec.ts`: `should classify 'ya pague' as CONFIRM_PAYMENT with HIGH confidence` |
| AC-10 | `PaymentFallbackFlow` pide código de orden → valida → pide confirmación → crea Payment manual | Test e2e: `should complete payment fallback flow with manual confirmation` |
| AC-11 | Payment manual genera `paymentIntentId = "manual_{orderId}_{timestamp}"` único | Test unit: `should generate unique manual paymentIntentId` |
| AC-12 | Merchant recibe notificación por WhatsApp cuando pago confirmado (webhook o fallback) | Test unit: mock de `MerchantNotificationService.notifyPaymentConfirmed` llamado |
| AC-13 | Si Order ya en status `paid`, nueva confirmación retorna gracefully sin error | Test e2e: `should handle payment confirmation for already paid order gracefully` |
| AC-14 | Env vars `PAYMENT_WEBHOOK_SECRET` y `PAYMENT_WEBHOOK_HEADER` configurables | `.env.example` actualizado con ambos |
| AC-15 | Tests unit cubren: idempotencia, state transitions, webhook parsing, signature validation | Coverage > 80% en `payment.service.ts` |
| AC-16 | Test e2e cubre: webhook success, webhook duplicado, fallback flow completo, signature validation, order not found | `payment-webhook.e2e-spec.ts` + `payment-fallback-flow.e2e-spec.ts` |
| AC-17 | `BACKEND-EXECUTION-GUIDE.md` actualizado con Flujo 7: Payments (webhook + fallback) + cURL examples con signature | Doc contiene sección "Flujo 7: Payments" con ejemplos |

## Plan de pruebas

### Unit tests

**PaymentService** (`payment.service.spec.ts`):
- `should create payment and transition order status to paid` (REQ-03, AC-02)
- `should be idempotent - same paymentIntentId does not duplicate` (REQ-06, AC-03)
- `should process webhook and confirm payment` (REQ-05, AC-06)
- `should not confirm payment if webhook status is rejected` (AC-07)
- `should generate unique manual paymentIntentId` (REQ-08, AC-11)
- `should throw if order not found`
- `should call MerchantNotificationService on payment confirmation` (REQ-09, AC-12)

**PaymentWebhookController** (`payment-webhook.controller.spec.ts`):
- `should validate HMAC signature correctly`
- `should reject request with invalid signature` (AC-05)
- `should parse webhook payload and call PaymentService` (AC-06)

**IntentRouter** (`intent-router.spec.ts`):
- `should classify 'ya pague' as CONFIRM_PAYMENT with HIGH confidence` (REQ-07, AC-09)
- `should classify 'transferí' as CONFIRM_PAYMENT`

**PaymentFallbackFlow** (`payment-fallback.flow.spec.ts`):
- `should ask for order code when detecting CONFIRM_PAYMENT intent`
- `should validate order exists and belongs to customer`
- `should confirm payment manually after user confirmation` (REQ-08, AC-10)

### E2E tests

**Payment Webhook** (`payment-webhook.e2e-spec.ts`):
- `should accept webhook POST request` (AC-04)
- `should reject webhook with invalid signature` (AC-05)
- `should handle duplicate webhook idempotently` (REQ-06, AC-08)
- `should confirm payment and transition order to paid` (AC-02)
- `should handle payment confirmation for already paid order gracefully` (AC-13)
- `should return 404 if order not found`
- `should register payment as failed if webhook status is rejected` (AC-07)

**Payment Fallback Flow** (`payment-fallback-flow.e2e-spec.ts`):
- `should complete payment fallback flow with manual confirmation` (AC-10)
- `should reject invalid order code`
- `should reject if order already paid`
- `should handle cancellation gracefully`

### Manual testing (optional)

- Usar ngrok + Postman para simular webhook desde gateway real
- Usar WhatsApp sandbox para probar fallback "PAGADO"
- Verificar logs structured y notificaciones al merchant

## DoD

- [ ] Todos los AC tienen evidencia (tests pasan)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres: `Payment` model creado
- [ ] Idempotencia implementada y testeada: constraint unique en `paymentIntentId` + tests
- [ ] Guardrails: bot NO inventa confirmaciones (solo procesa webhook o comando explícito)
- [ ] PII minimizada: logs de webhooks no incluyen datos sensibles completos
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migración `pr_06_add_payment_models` incluida y aplicada
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con Flujo 7 + cURL examples con signature
- [ ] `.env.example` actualizado con `PAYMENT_WEBHOOK_SECRET` y `PAYMENT_WEBHOOK_HEADER`

## Constraints

- Guardrails: el bot NO inventa que un pago fue confirmado. Siempre requiere webhook o comando explícito del cliente.
- PII: logs de webhooks deben sanitizar datos sensibles (tarjetas, tokens).
- Transición de estado es atómica: Payment y Order se actualizan en misma transacción (o con retry logic si falla).

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Webhook replay attack | Media | Alto | HMAC signature validation + timestamp check en V2 |
| Race condition (2 webhooks simultáneos) | Media | Alto | Constraint unique DB-level + catch y retry idempotente |
| Order not found en webhook | Media | Medio | 404 graceful + log structured warning |
| Cliente abusa de fallback manual | Baja | Medio | Rate limiting por customer en V2 + merchant puede verificar transferencias |
| Gateway cambia formato de payload | Media | Alto | Schema validation con class-validator + error logs |
| Monto webhook ≠ Order.totalAmount | Media | Medio | Log discrepancia (no bloquea en MVP), reconciliación en V2 |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| | | |

---

**DRAFT completado**. Esperando aprobación humana (BRIEF GATE) para proceder con creación de issue y branch.
