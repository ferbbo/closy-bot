# PR Brief — PR-01 — Inbound WhatsApp: normalización + dedupe persistido

> Archivo: `docs/plan/pr-briefs/PR-01-inbound-whatsapp-dedupe.md`
> 
> Regla: 1 página. Machine-actionable. Sin scope extra.

## Objetivo

Implementar webhook inbound de WhatsApp que normaliza mensajes y garantiza procesamiento "exactly-once" vía persistencia y dedupe por `message_id`. Fundación para toda la lógica conversacional posterior.

## Scope fence

### ✅ Included

- Endpoint POST `/webhooks/whatsapp/inbound` con validación básica
- DTO normalizado para mensajes entrantes (`InboundMessageDto`)
- Persistencia de eventos inbound en PostgreSQL con constraint unique
- Dedupe por `message_id` (WhatsApp guarantee unique per conversation)
- Estructura modular NestJS (controller + service + repository)
- Tests unitarios + integración para idempotencia

### ❌ Excluded

- Procesamiento NLP/LLM de contenido de mensajes
- Lógica de catálogo/carrito
- Respuestas automáticas (outbound)
- Integración con WhatsApp Business API (solo recibe webhooks)
- Validación avanzada de payload WhatsApp

## Paths a tocar (concretos)

- `apps/api/src/channels/whatsapp/whatsapp.controller.ts` (nuevo)
- `apps/api/src/channels/whatsapp/whatsapp.service.ts` (nuevo)
- `apps/api/src/channels/whatsapp/dto/inbound-message.dto.ts` (nuevo)
- `apps/api/src/channels/interfaces/message.interface.ts` (actualizar)
- `apps/api/src/persistence/repositories/message.repository.ts` (nuevo)
- `prisma/schema.prisma` (agregar `InboundMessage` model)
- `apps/api/src/channels/whatsapp/whatsapp.controller.spec.ts` (nuevo)
- `apps/api/src/channels/whatsapp/whatsapp.service.spec.ts` (nuevo)

## Contratos / Interfaces

- **Endpoints:**
  - `POST /webhooks/whatsapp/inbound` (JSON payload, retorna 200)

- **DTOs / payloads:**
  - `InboundMessageDto`: `message_id`, `from`, `timestamp`, `text`, `media_type?`, `media_url?`
  - Response: `{ processed: boolean, duplicate?: boolean }`

- **Persistencia (Prisma/models):**
  ```prisma
  model InboundMessage {
    id         String   @id @default(cuid())
    messageId  String   @unique @map("message_id") // WhatsApp unique ID
    from       String   // Phone number
    timestamp  DateTime
    text       String?
    mediaType  String?  @map("media_type")
    mediaUrl   String?  @map("media_url")
    processed  Boolean  @default(false)
    createdAt  DateTime @default(now()) @map("created_at")
    
    @@map("inbound_messages")
  }
  ```

- **Idempotencia:**
  - Key: `message_id` (WhatsApp garantiza único por conversación)
  - Constraint: `@@unique([messageId])` en Prisma
  - Estrategia: INSERT único, catch duplicate key exception → return **HTTP 200** con flag `duplicate: true`
  - **⚠️ Decisión arquitectónica:** Se retorna 200 (no 409) para duplicados — idempotencia webhook semánticamente correcta

## Comportamiento

- **Happy path:**
  1. Webhook recibe payload WhatsApp válido
  2. Validar DTO (`message_id` required, `from` required)
  3. Intentar insertar en `inbound_messages` con `processed: false`
  4. Si éxito → return 200 `{ processed: true }`
  5. Logging con `conversation_id` derivado de `from`

- **Edge cases:**
  - **Duplicados:** mismo `message_id` → catch Prisma unique violation → return **HTTP 200** `{ processed: false, duplicate: true }`
  - **Reintentos:** WhatsApp reenvía → mismo comportamiento que duplicados (HTTP 200)
  - **Payload malformado:** return 400 con validation errors
  - **DB error (no constraint):** return 500, log error
  - **Nota:** HTTP 200 para duplicados es más semánticamente correcto que 409 para webhooks idempotentes

## Acceptance criteria (verificables)

- [ ] Webhook duplicado (mismo `message_id`) procesa exactamente 1 vez (test + manual)
- [ ] Payload válido se persiste correctamente con `processed: false`  
- [ ] Payload inválido retorna 400 con detalles de validación
- [ ] DB puede levantar/caer sin perder correctness del dedupe
- [ ] Logs incluyen `message_id` y `from` para debugging (sin PII completo)
- [ ] Prisma migration funciona en fresh DB

## Comandos para validar

- `pnpm lint`
- `pnpm test`
- `pnpm db:generate` (genera Prisma client)
- `pnpm db:migrate` (aplica nueva migration)
- Smoke test manual: `curl -X POST localhost:3000/webhooks/whatsapp/inbound -H "Content-Type: application/json" -d '{"message_id":"test123","from":"1234567890","timestamp":"2026-02-11T19:30:00Z","text":"hola"}'`

## Riesgos y mitigaciones

- **WhatsApp payload cambia:** usar DTO con validación estricta, fallar rápido en bad input
- **message_id colisiones:** WhatsApp garantiza unique, pero validar en tests
- **DB constraint falla silently:** tests específicos de unique violation + monitoring
- **Performance en high volume:** índices en `message_id` y `from`, considerar partitioning más adelante

## Notas

- **Idempotencia HTTP:** Se decidió retornar **200** (no 409) para duplicados con flag `duplicate: true`. Razón: HTTP 200 es semánticamente más correcto para idempotencia webhook — mismo input produce mismo efecto sin requerir acción del cliente. 409 implicaría conflicto que el cliente debe resolver.
- Guardrails: el bot NO inventa precio/stock/políticas/ETA.
- PII: minimizar y evitar logs con datos sensibles (`from` phone solo parcial en logs).
- Este PR es foundation; lógica conversacional irá en PR-02+.
- WhatsApp webhook verification (challenge/verify) se asume configurado en infra externa.