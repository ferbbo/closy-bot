# PR Brief — PR-02 — Modelos base: merchant/customer/conversation + estado mínimo

> Archivo: `docs/plan/pr-briefs/PR-02-modelos-base-merchant-customer-conversation.md`
> 
> Regla: 1 página. Machine-actionable. Sin scope extra.

## Objetivo

Crear los modelos fundamentales de identidad y sesión (Merchant, Customer, Conversation) con sus servicios y repositorios para resolver identidad por teléfono y mantener `conversation_id` persistido con estado mínimo.

## Scope fence

### ✅ Included

- Modelos Prisma: `Customer`, `Conversation` y `Merchant` con campos mínimos
- Repositorios con operaciones CRUD básicas
- Servicios de dominio para resolución de identidad y gestión de conversaciones 
- Correlación por `conversation_id` en logs
- Migración de base de datos
- Tests unitarios de repositorios y servicios

### ❌ Excluded

- Flows de compra (carrito/checkout)
- Integración con LLM/orquestador avanzado
- Dashboard/métricas  
- Validaciones complejas de negocio
- Autenticación/autorización de merchants

## Paths a tocar (concretos)

- `prisma/schema.prisma` - agregar modelos Customer, Conversation, Merchant
- `apps/api/src/domain/entities/` - crear entity classes
- `apps/api/src/persistence/repositories/` - customer.repository.ts, conversation.repository.ts, merchant.repository.ts
- `apps/api/src/services/` - customer.service.ts, conversation.service.ts
- `apps/api/src/persistence/persistence.module.ts` - registrar nuevos repos
- `apps/api/src/services/services.module.ts` - registrar nuevos servicios
- `apps/api/test/` - tests unitarios de repos y servicios

## Contratos / Interfaces

- Persistencia (Prisma/models):
  - `Customer`: id, phone (unique), name?, language?, created_at, updated_at
  - `Conversation`: id, customer_id, channel, status, last_message_at, created_at, updated_at  
  - `Merchant`: id, name, whatsapp_number, api_key (unique), created_at, updated_at
- Repositorios:
  - `CustomerRepository`: findByPhone(), create(), update()
  - `ConversationRepository`: findByCustomerAndChannel(), create(), update(), findById()
  - `MerchantRepository`: findByApiKey(), findById()
- Servicios:
  - `CustomerService`: resolveByPhone() - get or create customer
  - `ConversationService`: getOrCreateConversation(customer, channel), updateStatus()
- Idempotencia:
  - Key: `phone` para Customer (unique constraint)
  - Key: `api_key` para Merchant (unique constraint)
  - Conversation usa combinación customer_id + channel como business key

## Comportamiento

- Happy path:
  1. Mensaje llega con phone number
  2. CustomerService.resolveByPhone() encuentra o crea customer
  3. ConversationService.getOrCreateConversation() encuentra o crea conversación
  4. conversation_id se usa para correlacionar logs
- Edge cases:
  - Duplicados: unique constraints previenen duplicación
  - Reintentos: operaciones idempotentes por design
  - Teléfono malformado: validación básica en DTO

## Acceptance criteria (verificables)

- [ ] Modelo Customer con phone unique puede crear/buscar por teléfono
- [ ] Modelo Conversation mantiene relación con Customer y estado persistido
- [ ] CustomerService.resolveByPhone() es idempotente (mismo phone = mismo customer)  
- [ ] ConversationService puede crear/recuperar conversación por customer+channel
- [ ] Logs incluyen conversation_id cuando está disponible
- [ ] Migración Prisma ejecuta sin errores
- [ ] Tests unitarios cubren casos happy path + edge cases de repos y servicios

## Comandos para validar

- `pnpm lint`
- `pnpm test`
- `pnpm db:migrate`
- `pnpm db:generate`

## Riesgos y mitigaciones

- **Riesgo**: Formato de phone numbers inconsistente entre países
  - **Mitigación**: Normalización básica (remover espacios/guiones) y validación mínima
- **Riesgo**: Múltiples conversaciones simultáneas por customer
  - **Mitigación**: Por ahora 1 conversación activa por customer+channel, evolucionar después

## Notas

- Guardrails: el bot NO inventa precio/stock/políticas/ETA.
- PII: minimizar y evitar logs con datos sensibles (phone numbers enmascarados en logs).
- Los modelos deben    ser extensibles para futuras funcionalidades sin breaking changes.