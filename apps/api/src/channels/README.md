# Channels Module

This module handles all channel adapters and message normalization.

## Scope (Bootstrap)

Currently a placeholder. Future implementation will include:

- WhatsApp Business API webhook receiver
- Message deduplication by `messageId` (idempotency)
- Normalization to `NormalizedMessage` interface
- Outbound message sender

## Architecture

```
channels/
├── whatsapp/           # WhatsApp-specific adapter
│   ├── webhook.controller.ts
│   ├── sender.service.ts
│   └── normalizer.ts
├── interfaces/         # Shared message interfaces
└── channels.module.ts
```

## Idempotency Rule

All inbound webhooks MUST deduplicate by provider `messageId` to prevent double-processing.
See: `.github/copilot-instructions.md` section 2.1
