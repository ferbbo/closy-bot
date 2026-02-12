# Analytics Module

This module handles event tracking and metrics for business intelligence.

## Scope (Bootstrap)

Currently a placeholder. Future implementation will include:

- **Event Tracking** - Funnel events (conversation_start, cart_created, checkout_start, payment_ok)
- **Metrics Service** - Aggregated metrics calculation
- **Dashboard API** - Endpoints for dashboard consumption

## Architecture

```
analytics/
├── events/
│   ├── event.emitter.ts
│   └── event.types.ts
├── metrics/
│   └── metrics.service.ts
└── analytics.module.ts
```

## Key Metrics (MVP)

From `docs/mvp-core-v1.md`:
- Conversion: conversations → checkout_start → payment_ok
- Cart recovery rate
- Handoff rate
- Average response time
