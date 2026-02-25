# Brief — PR-07 — Postventa: estado de pedido + tickets simples

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-07-post-sale-status-tickets.md`
> **Issue**: [#92](https://github.com/ferbbo/closy-bot/issues/92)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Habilitar post-venta básica: (1) cliente consulta estado de su pedido con respuestas template-first, (2) cliente crea tickets simples (faltante/dañado/retraso/otro) que notifican al merchant. Todo 100% determinístico con templates configurables en PlaybookConfig.

## Scope fence

### ✅ Included

- Modelo Prisma: `Ticket` (orderId, customerId, merchantId, type enum, status enum, description, createdAt)
- Enum `TicketType`: `missing`, `damaged`, `delay`, `other`
- Enum `TicketStatus`: `open`, `resolved`, `closed`
- `PostSaleService`: `getOrderStatus(merchantId, customerId, orderCode?)`, `createTicket(orderId, type, description)`
- `PostSaleFlow` (template-first): 
  - Maneja intent `ORDER_STATUS` → busca último pedido o pide orderCode → responde con template según estado
  - Maneja intent `CREATE_TICKET` → clasifica tipo por keywords → crea ticket + notifica
- Intents nuevos en IntentRouter:
  - `ORDER_STATUS`: keywords `["estado", "como va", "pedido", "orden", "mi compra", "donde esta"]`
  - `CREATE_TICKET`: keywords `["problema", "reclamo", "falta", "dañado", "daño", "no llego", "demora"]`
- Templates de respuesta en PlaybookConfig (extensión de `PlaybookMessages`):
  - `orderStatusTemplate`: placeholders `{orderCode}`, `{status}`, `{statusMessage}`, `{trackingInfo?}`
  - `ticketCreatedConfirm`: placeholder `{ticketId}`
  - `ticketTypePrompt`: "¿Qué tipo de problema tienes? 1) Falta algo 2) Llegó dañado 3) Se demoró 4) Otro"
  - `noOrderFound`: "No encontré pedidos tuyos. ¿Cuál es el código de tu pedido?"
- Status messages por estado (en industry presets):
  - `pending_payment`: "Tu pedido {orderCode} está pendiente de pago."
  - `confirmed`: "Tu pedido {orderCode} está confirmado y en preparación."
  - `paid`: "Tu pedido {orderCode} está pagado y en preparación."
  - `shipped`: "Tu pedido {orderCode} fue enviado. {trackingInfo}"
  - `delivered`: "Tu pedido {orderCode} ya fue entregado."
  - `cancelled`: "Tu pedido {orderCode} fue cancelado."
- Notificación al merchant vía `MerchantNotificationService`:
  - `"🔔 Ticket abierto para {orderCode}\nTipo: {type}\nCliente: {customerName}\nDescripción: {description}"`
- Tests unit (PostSaleService) + e2e (flujos ORDER_STATUS y CREATE_TICKET)
- Migración: crear tabla `tickets` con índices
- Actualización de `BACKEND-EXECUTION-GUIDE.md` con ejemplos de flujos conversacionales
- Consumer-first: flujos diseñados desde la perspectiva del cliente (lenguaje claro, sin códigos técnicos)

### ❌ Excluded

- SLA tracking (tiempo de resolución, escalación automática por tiempo)
- Workflows complejos de tickets (re-asignación, priorización, categorización avanzada)
- Adjuntos de evidencia (fotos/videos del problema) — V2
- Integración con sistema de tickets externo (Zendesk, Freshdesk)
- UI dashboard de tickets — eso es PR-FE-07
- Merchant commands para cerrar/resolver tickets vía WhatsApp — V2 (PR-05.3)
- Historial de cambios de status del ticket (audit log)
- Múltiples tickets por orden (V1 permite 1 ticket activo por orden)
- Notificaciones al cliente cuando merchant resuelve ticket — V2
- Búsqueda/filtro de tickets en conversación

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear modelo Prisma `Ticket` con campos: orderId, customerId, merchantId, type, status, description, createdAt, updatedAt | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-01 |
| REQ-02 | Crear enums `TicketType` (missing, damaged, delay, other) y `TicketStatus` (open, resolved, closed) | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-01 |
| REQ-03 | `PostSaleService.getOrderStatus(merchantId, customerId, orderCode?)`: busca orden por orderCode o último pedido del cliente, retorna orden con status | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-02, AC-03 |
| REQ-04 | `PostSaleService.createTicket(orderId, customerId, type, description)`: crea ticket con status `open` | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-04 |
| REQ-05 | `PostSaleFlow.handleOrderStatus()`: flow determinístico con templates por estado (sin LLM) | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-05, AC-06, AC-07 |
| REQ-06 | `PostSaleFlow.handleCreateTicket()`: flow determinístico que clasifica tipo por keywords y crea ticket | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-08, AC-09 |
| REQ-07 | Intent `ORDER_STATUS` en IntentRouter con keywords (estado, como va, pedido, etc.) | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-10 |
| REQ-08 | Intent `CREATE_TICKET` en IntentRouter con keywords (problema, reclamo, falta, etc.) | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-11 |
| REQ-09 | Extensión de `PlaybookMessages` con templates de post-venta (orderStatusTemplate, ticketCreatedConfirm, etc.) | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-12 |
| REQ-10 | Industry presets (ropa/belleza/minimarket) con status messages específicos | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-13 |
| REQ-11 | Notificación al merchant vía `MerchantNotificationService` al crear ticket | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-14 |
| REQ-12 | FKs: `Ticket.orderId → Order.id`, `Ticket.customerId → Customer.id`, `Ticket.merchantId → Merchant.id` | [#92](https://github.com/ferbbo/closy-bot/issues/92) | AC-01 |

## Paths a tocar (concretos)

- `prisma/schema.prisma`: modelo `Ticket` + enums + migración `pr_07_add_ticket_models`
- `apps/api/src/domain/entities/ticket.entity.ts`: entity `Ticket`
- `apps/api/src/services/post-sale.service.ts`: nuevo servicio
- `apps/api/src/services/post-sale.service.spec.ts`: tests unitarios
- `apps/api/src/orchestrator/flows/post-sale.flow.ts`: nuevo flow determinístico
- `apps/api/src/orchestrator/flows/post-sale.flow.spec.ts`: tests flow
- `apps/api/src/orchestrator/intent/keyword-configs.ts`: agregar `ORDER_STATUS` y `CREATE_TICKET`
- `apps/api/src/orchestrator/types/intent.types.ts`: agregar intents al union type `IntentKey`
- `apps/api/src/services/playbook.service.ts`: extender `PlaybookMessages` interface
- `apps/api/src/common/config/playbooks/*.config.ts`: agregar templates post-venta en presets
- `apps/api/src/orchestrator/conversation.orchestrator.ts`: agregar routing a `PostSaleFlow`
- `apps/api/src/services/services.module.ts`: registrar `PostSaleService`
- `test/post-sale-flow.e2e-spec.ts`: tests e2e (ORDER_STATUS + CREATE_TICKET)
- `docs/BACKEND-EXECUTION-GUIDE.md`: Flujo 7 — Post-venta (ejemplos conversacionales)

## Contratos / Interfaces

### Entity (Prisma)

| Entity | Field | Type | Constraints |
|--------|-------|------|-------------|
| Ticket | id | String | @id @default(cuid()) |
| | orderId | String | FK to Order, indexed |
| | customerId | String | FK to Customer, indexed |
| | merchantId | String | FK to Merchant, indexed |
| | type | TicketType | enum (missing, damaged, delay, other) |
| | status | TicketStatus | enum (open, resolved, closed), default: open |
| | description | String | @db.Text |
| | createdAt | DateTime | @default(now()) |
| | updatedAt | DateTime | @updatedAt |

### Service interfaces

```typescript
// PostSaleService
interface OrderStatusResult {
  found: boolean;
  order?: Order; // includes status
  message: string; // template-filled message
}

interface CreateTicketResult {
  ticketId: string;
  orderCode: string;
  type: TicketType;
}

class PostSaleService {
  async getOrderStatus(
    merchantId: string, 
    customerId: string, 
    orderCode?: string
  ): Promise<OrderStatusResult>
  
  async createTicket(
    orderId: string, 
    customerId: string, 
    merchantId: string,
    type: TicketType, 
    description: string
  ): Promise<CreateTicketResult>
}
```

### PlaybookMessages extension

```typescript
interface PlaybookMessages {
  // ... existing fields
  
  // PR-07: Post-sale templates
  orderStatusTemplate: string; // "{orderCode}: {statusMessage}"
  orderStatusPendingPayment: string;
  orderStatusConfirmed: string;
  orderStatusPaid: string;
  orderStatusShipped: string;
  orderStatusDelivered: string;
  orderStatusCancelled: string;
  
  noOrderFound: string;
  ticketTypePrompt: string;
  ticketCreatedConfirm: string; // "Ticket {ticketId} creado. El merchant fue notificado."
  ticketDescriptionPrompt: string; // "Describe brevemente el problema:"
}
```

### Intent keywords (keyword-configs.ts)

```typescript
ORDER_STATUS: [
  { phrase: 'estado', weight: 5 },
  { phrase: 'como va mi pedido', weight: 5 },
  { phrase: 'donde esta mi pedido', weight: 5 },
  { phrase: 'mi pedido', weight: 3 },
  { phrase: 'mi orden', weight: 3 },
  { phrase: 'tracking', weight: 4 },
  { phrase: 'seguimiento', weight: 4 },
]

CREATE_TICKET: [
  { phrase: 'problema', weight: 5 },
  { phrase: 'reclamo', weight: 5 },
  { phrase: 'falta', weight: 4 },
  { phrase: 'no llego', weight: 5 },
  { phrase: 'dañado', weight: 5 },
  { phrase: 'danado', weight: 5 },
  { phrase: 'daño', weight: 5 },
  { phrase: 'demora', weight: 4 },
  { phrase: 'tardanza', weight: 4 },
  { phrase: 'incompleto', weight: 4 },
]
```

## Comportamiento

### Happy path (ORDER_STATUS)

1. Cliente envía: "¿Cómo va mi pedido?"
2. IntentRouter clasifica como `ORDER_STATUS` (high confidence)
3. `ConversationOrchestrator` delega a `PostSaleFlow.handleOrderStatus()`
4. Flow llama `PostSaleService.getOrderStatus(merchantId, customerId)`
5. Service busca último Order del cliente con status no cancelado
6. Flow obtiene template según `order.status` de PlaybookConfig
7. Flow rellena placeholders: `{orderCode}`, `{statusMessage}`
8. Bot responde: "Tu pedido ORD-001 está confirmado y en preparación."

### Happy path (CREATE_TICKET - con orderCode conocido)

1. Cliente envía: "Mi pedido llegó dañado"
2. IntentRouter clasifica como `CREATE_TICKET` (high confidence, keyword "dañado")
3. Flow detecta tipo `damaged` por keyword
4. Flow pregunta: "Describe brevemente el problema:"
5. Cliente responde: "La caja estaba rota y el producto tiene rayones"
6. Flow llama `PostSaleService.createTicket(orderId, customerId, merchantId, 'damaged', description)`
7. Service crea Ticket con status `open`
8. Service llama `MerchantNotificationService.notifyTicketCreated(ticket)`
9. Bot responde: "Ticket creado. El merchant fue notificado."
10. Merchant recibe WhatsApp: "🔔 Ticket abierto para ORD-001\nTipo: damaged\nCliente: Juan\nDescripción: La caja..."

### Edge cases

#### Sin pedido encontrado
- Cliente pregunta estado pero no tiene pedidos → bot responde: "No encontré pedidos tuyos. ¿Cuál es el código de tu pedido?"
- Cliente provee orderCode inválido → bot responde mismo mensaje

#### Múltiples pedidos activos
- Service retorna el último pedido (ordenado por `createdAt DESC`)
- Cliente puede especificar orderCode si quiere consultar otro

#### Ticket sin orden específica
- Flow pregunta orderCode si no puede inferirlo del contexto
- Si cliente dice "tengo un problema" sin mencionar orden → flow pide orderCode primero

#### Tipo de ticket ambiguo
- Si keywords no permiten clasificar tipo → flow muestra prompt con opciones (1-4)
- Cliente elige número o text → flow mapea a TicketType

#### Descripción vacía o muy corta
- Flow acepta cualquier texto > 3 caracteres (sin validación estricta en V1)

#### Idempotencia
- No hay idempotencia especial en V1 (cada mensaje crea nuevo ticket)
- En V2 se podría agregar dedupe por conversationId+timestamp

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Migración crea tabla `tickets` con enums TicketType y TicketStatus | `pnpm db:migrate` exitoso, schema contiene modelo Ticket |
| AC-02 | `PostSaleService.getOrderStatus()` retorna último pedido del cliente con status | test: `post-sale.service.spec.ts` → `should return last order` |
| AC-03 | `PostSaleService.getOrderStatus(orderCode)` busca por orderCode específico | test: `post-sale.service.spec.ts` → `should find order by orderCode` |
| AC-04 | `PostSaleService.createTicket()` crea Ticket con status `open` | test: `post-sale.service.spec.ts` → `should create ticket` |
| AC-05 | `PostSaleFlow.handleOrderStatus()` responde con template según order.status | test: `post-sale.flow.spec.ts` → `should respond with status template` |
| AC-06 | Cliente sin pedidos recibe mensaje "No encontré pedidos tuyos" | test: `post-sale.flow.spec.ts` → `should handle no orders found` |
| AC-07 | Cliente con pedido `shipped` recibe template con tracking info (si disponible) | test: `post-sale.flow.spec.ts` → `should include tracking info` |
| AC-08 | `PostSaleFlow.handleCreateTicket()` clasifica tipo por keywords | test: `post-sale.flow.spec.ts` → `should classify ticket type` |
| AC-09 | Ticket creado notifica al merchant vía WhatsApp | test: `post-sale.flow.spec.ts` → mock `MerchantNotificationService.notifyTicketCreated` llamado |
| AC-10 | IntentRouter clasifica "¿cómo va mi pedido?" como ORDER_STATUS con high confidence | test: `intent-router.service.spec.ts` → `should classify ORDER_STATUS` |
| AC-11 | IntentRouter clasifica "mi pedido llegó dañado" como CREATE_TICKET con high confidence + keyword "dañado" | test: `intent-router.service.spec.ts` → `should classify CREATE_TICKET` |
| AC-12 | PlaybookMessages tiene todos los campos de post-venta (orderStatusTemplate, ticketCreatedConfirm, etc.) | code review: `playbook.service.ts` interface actualizada |
| AC-13 | Industry presets (ropa/belleza/minimarket) tienen status messages específicos | code review: `common/config/playbooks/*.config.ts` contienen templates |
| AC-14 | Merchant recibe notificación WhatsApp con formato correcto al crear ticket | test e2e: `post-sale-flow.e2e-spec.ts` → verificar OutboxMessage enqueued |
| AC-15 | E2E: Cliente pregunta estado → recibe respuesta template-first sin LLM | test e2e: `post-sale-flow.e2e-spec.ts` → `POST /webhooks/whatsapp` → verify outbound message |
| AC-16 | E2E: Cliente reporta problema → ticket creado + merchant notificado | test e2e: `post-sale-flow.e2e-spec.ts` → verify Ticket en DB + OutboxMessage |

## Plan de pruebas

### Unit (PostSaleService)
- `should return last order for customer`
- `should find order by orderCode`
- `should return null if no orders found`
- `should create ticket with correct fields`
- `should set ticket status to open by default`

### Unit (PostSaleFlow)
- `should respond with status template for each OrderStatus value`
- `should handle no orders found`
- `should ask for orderCode if ambiguous`
- `should classify ticket type from keywords`
- `should prompt for description if missing`
- `should notify merchant after ticket creation`

### Unit (IntentRouter)
- `should classify ORDER_STATUS intent`
- `should classify CREATE_TICKET intent`
- `should handle ambiguous queries (UNKNOWN)`

### E2E
- **ORDER_STATUS flow:**
  - Cliente pregunta estado → bot responde con template según status
  - Cliente sin pedidos → bot responde "no encontré pedidos"
  - Cliente con orderCode específico → bot responde ese pedido
- **CREATE_TICKET flow:**
  - Cliente reporta problema → bot crea ticket + notifica merchant
  - Cliente reporta sin orderCode → bot pide orderCode
  - Ticket creado tiene type correcto según keywords

### Manual (si aplica)
- Verificar notificación WhatsApp al merchant (formato legible)
- Verificar templates en diferentes idiomas (español estándar)

## DoD

- [x] Todos los AC tienen evidencia (tests)
- [x] Sin scope creep (solo lo del brief)
- [x] Estado persistido en Postgres (`Ticket` model)
- [ ] Idempotencia implementada y testeada — NO APLICA en V1 (cada mensaje crea nuevo ticket)
- [x] Guardrails: bot NO inventa estados o info de pedidos (usa DB)
- [x] PII minimizada (solo customerId, merchantId, description text)
- [x] `pnpm lint` y `pnpm test` pasan
- [x] DB: migración incluida (`pr_07_add_ticket_models`)
- [x] Consumer-first design: flujos claros para cliente sin jerga técnica
- [x] Template-first: cero calls LLM en flows ORDER_STATUS y CREATE_TICKET

## Constraints

- **Template-first obligatorio**: PostSaleFlow NO usa LLM para generar respuestas. Todo es template-based con placeholders.
- **Guardrails**: bot NO inventa estados de pedido. Siempre consulta OrderStatus desde DB.
- **PII**: descripción de ticket puede contener datos sensibles — NO loggear en application logs (solo en structured logs con nivel DEBUG).
- **Single ticket per order V1**: si ya existe ticket `open` para una orden, permitir crear otro en V1 (sin restricción). En V2 se puede agregar límite.

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Clasificación de tipo de ticket incorrecta (keywords ambiguos) | Media | Bajo | Flow muestra prompt con 4 opciones si ambiguo |
| Cliente reporta problema sin especificar orderCode | Media | Medio | Flow pide orderCode si no puede inferir |
| Merchant no ve notificación (OutboxMessage falla) | Baja | Alto | Outbox retry con exponential backoff (ya implementado PR-03.9) |
| Templates no cubren todos los casos de status | Baja | Bajo | Industry presets tienen fallback genérico |
| Cliente espera respuesta inmediata del merchant | Alta | Medio | Template de confirmación aclara "El merchant fue notificado y responderá pronto" |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| | | |
