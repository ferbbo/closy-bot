# Domain Module

This module contains core business entities and domain logic.

## Scope (PR-02)

Core identity and session entities:

- **Customer** - Customer identity resolved by phone number (unique constraint)
- **Merchant** - Business/merchant entity with API key authentication
- **Conversation** - Chat session between customer and merchant on a specific channel

Future entities (upcoming PRs):

- **Cart** - Shopping cart entity and operations (add/remove/update)
- **Order** - Order entity with state machine (pending → paid → fulfilled)
- **Ticket** - Post-sale support tickets
- **Product** - Product catalog with variants and stock

## Architecture

```
domain/
├── entities/
│   ├── customer.entity.ts      # ✅ Implemented (PR-02)
│   ├── merchant.entity.ts      # ✅ Implemented (PR-02)
│   ├── conversation.entity.ts  # ✅ Implemented (PR-02)
│   ├── cart.entity.ts          # 🔜 Coming soon
│   ├── order.entity.ts         # 🔜 Coming soon
│   └── ticket.entity.ts        # 🔜 Coming soon
└── domain.module.ts
```

## Guidelines

- Entities should be rich domain models with behavior, not anemic data structures
- State transitions must be explicit methods (e.g., `order.confirmPayment()`)
- All state changes must be persisted atomically
- PII (phone numbers) must be masked in logs

## Current Entities

### Customer
- Identity resolved by **phone number** (normalized, unique)
- Supports phone normalization (removes spaces, dashes, parentheses)
- Language preference (defaults to 'es')
- Optional name field

### Merchant
- Business entity with **API key** for authentication (unique)
- WhatsApp number for outbound messaging
- Relates to conversations

### Conversation
- Chat session between customer and merchant
- Channel-specific (whatsapp, webchat, instagram)
- Status: active, closed, handoff
- Tracks last message timestamp for conversation lifecycle
