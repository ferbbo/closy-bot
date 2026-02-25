# Evidence — PR-05.2 Message Relay

> **Branch**: `PR-05.2-message-relay`
> **Issue**: #94
> **Date**: 2026-02-25

## AC-01: Migración DB

```
migrations/20260225145748_pr_05_2_message_relay/migration.sql
```

Agrega:
- `ALTER TABLE "conversations" ADD COLUMN "handoff_active" BOOLEAN NOT NULL DEFAULT false;`
- `ALTER TABLE "message_logs" ADD COLUMN "source" TEXT;`

## AC-02: Parser — nuevos comandos

**File**: `apps/api/src/services/merchant-command-parser.service.spec.ts`
**Suite**: `AC-02 (PR-05.2): parse() — msg / handoff / cerrar handoff`

```
✓ should parse "msg ORD-001 Hola cliente"
✓ should parse "msg ORD-002 Tu pedido sale mañana por la mañana" (diacritics preserved)
✓ should uppercase orderCode in msg command
✓ should parse "handoff ORD-001"
✓ should uppercase orderCode in handoff command
✓ should parse "cerrar handoff"
✓ should parse "Cerrar Handoff" (mixed case)
✓ should return null for "handoff" alone (no orderCode)
```

## AC-03: MessageRelayService

**File**: `apps/api/src/services/message-relay.service.spec.ts`

```
✓ AC-08: formatMessageForCustomer()
✓ AC-09: formatMessageForMerchant()
✓ AC-04: sendMessageToCustomer() — success
✓ AC-04: sendMessageToCustomer() — order not found
✓ AC-04: sendMessageToCustomer() — self-messaging error
✓ AC-05: activateHandoff() — success
✓ AC-05: activateHandoff() — order not found
✓ AC-05: activateHandoff() — idempotent
✓ AC-06: deactivateHandoff() — no active handoff
✓ AC-06: deactivateHandoff() — success
✓ sendMessageToMerchant() — success
✓ sendMessageToMerchant() — no whatsappNumber
✓ AC-10: source = 'relay' on customer send
✓ AC-10: source = 'relay' on merchant relay
```

## AC-04, AC-08: msg → OutboxMessage cliente (e2e)

```
✓ AC-04: merchant sends "msg ORD-R001 Tu pedido sale mañana" → OutboxMessage to customer
✓ AC-04: msg with unknown orderCode returns error confirmation
```

## AC-05: handoff activa handoffActive (e2e)

```
✓ AC-05: merchant sends "handoff ORD-R002" → conversation.handoffActive = true
✓ AC-05: idempotent — double handoff does not cause errors
```

## AC-06: cerrar handoff desactiva (e2e)

```
✓ AC-06: merchant sends "cerrar handoff" → handoffActive = false
✓ AC-06: idempotent — cerrar handoff without active handoff returns info message
```

## AC-07: Orchestrator relay (unit)

**File**: `apps/api/src/orchestrator/conversation.orchestrator.spec.ts`
**Suite**: `PR-05.2 AC-07: handoffActive relay`

```
✓ AC-07: should relay customer message when handoffActive = true (NO flows/LLM)
✓ AC-07: should process normally when handoffActive = false
```

## AC-07: Relay e2e

```
✓ AC-07: customer message with handoffActive = true is relayed to merchant (no bot response)
```

## AC-10: MessageLog source = 'relay' (e2e)

```
✓ AC-10: relay message logged with source = "relay"
```

## AC-11: Unit tests totales

```
Test Suites: 77 passed, 77 total
Tests:       725 passed, 725 total
```

## AC-12: E2E tests

```
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total  (≥ 8 requeridos)
```

## AC-13: BACKEND-EXECUTION-GUIDE.md

- Flujo 6.2 agregado con 5 cURL examples (msg, handoff, relay cliente, cerrar handoff, error)
- Tabla de estado actualizada con PR-05.2
