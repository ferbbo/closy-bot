# Services Module

This module contains application services for external integrations and cross-cutting concerns.

## Scope (PR-02)

Core identity and session services:

- **CustomerService** - Customer identity resolution (get-or-create pattern)
- **ConversationService** - Chat session management and status transitions

Future services (upcoming PRs):

- **Catalog Service** - Product search and availability
- **Payment Service** - Payment gateway integration (webhooks + idempotency)
- **Delivery Service** - Shipping zones, rates, tracking
- **Knowledge Base Service** - RAG for policies and FAQs

## Architecture

```
services/
├── customer.service.ts         # ✅ Implemented (PR-02)
├── conversation.service.ts     # ✅ Implemented (PR-02)
├── catalog/                    # 🔜 Coming soon
│   └── catalog.service.ts
├── payment/                    # 🔜 Coming soon
│   ├── payment.service.ts
│   └── webhook.controller.ts
└── services.module.ts
```

## Integration Guidelines

- All external webhooks must be idempotent (see `.github/copilot-instructions.md`)
- Payment webhooks: dedupe by `payment_intent_id`
- Never expose secrets in logs
- Use structured errors for external API failures
- PII must be masked in logs (phone numbers, addresses)

## Current Services

### CustomerService
- **resolveByPhone(phone, name?, language?)** - Get-or-create customer by phone (idempotent)
- Normalizes phone numbers before lookup (removes spaces/dashes/parentheses)
- Masks phone numbers in logs for PII protection
- Returns existing customer or creates new one with defaults

### ConversationService
- **getOrCreateConversation(customerId, merchantId, channel)** - Get or create active conversation
- Updates last message timestamp automatically
- Supports status transitions: active → closed / handoff
- One active conversation per customer+channel at a time
