# Domain Module

This module contains core business entities and domain logic.

## Scope (Bootstrap)

Currently a placeholder. Future implementation will include:

- **Cart** - Shopping cart entity and operations (add/remove/update)
- **Order** - Order entity with state machine (pending → paid → fulfilled)
- **Ticket** - Post-sale support tickets
- **Customer** - Customer identity and preferences

## Architecture

```
domain/
├── entities/
│   ├── cart.entity.ts
│   ├── order.entity.ts
│   └── ticket.entity.ts
├── services/
│   ├── cart.service.ts
│   └── order.service.ts
└── domain.module.ts
```

## Guidelines

- Entities should be rich domain models with behavior, not anemic data structures
- State transitions must be explicit methods (e.g., `order.confirmPayment()`)
- All state changes must be persisted atomically
