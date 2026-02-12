# Services Module

This module contains application services for external integrations and cross-cutting concerns.

## Scope (Bootstrap)

Currently a placeholder. Future implementation will include:

- **Catalog Service** - Product search and availability
- **Payment Service** - Payment gateway integration (webhooks + idempotency)
- **Delivery Service** - Shipping zones, rates, tracking
- **Knowledge Base Service** - RAG for policies and FAQs

## Architecture

```
services/
├── catalog/
│   └── catalog.service.ts
├── payment/
│   ├── payment.service.ts
│   └── webhook.controller.ts
└── services.module.ts
```

## Integration Guidelines

- All external webhooks must be idempotent (see `.github/copilot-instructions.md`)
- Payment webhooks: dedupe by `payment_intent_id`
- Never expose secrets in logs
- Use structured errors for external API failures
