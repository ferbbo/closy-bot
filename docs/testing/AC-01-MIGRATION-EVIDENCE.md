# AC-01 Migration Evidence

**PR**: PR-03.10-conversation-memory-retention  
**AC**: AC-01 - Migración crea `message_logs` + nuevos campos en `conversations`  
**Date**: 2026-02-17

## Migration File

- **Path**: `prisma/migrations/20260217175614_pr_03_10_message_logs_and_conversation_memory/migration.sql`
- **Status**: Applied successfully

## Validation Command

```bash
pnpm db:migrate
```

## Output

```
> closy-bot@1.0.0 db:migrate /Users/ferbbo/Documents/dev/sp/closy-bot
> prisma migrate dev --schema=prisma/schema.prisma

Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "closy_dev", schema "public" at "localhost:5432"

Already in sync, no schema change or pending migration was found.

✔ Generated Prisma Client (v5.22.0) to ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client in 40ms
```

## Schema Verification

### MessageLog Table

✅ Created with columns:
- `id` (TEXT, PRIMARY KEY)
- `conversationId` (TEXT, FK → conversations.id)
- `merchantId` (TEXT, FK → merchants.id)
- `direction` (MessageDirection enum: IN/OUT)
- `providerMessageId` (TEXT, nullable)
- `text` (TEXT, nullable)
- `mediaType` (TEXT, nullable)
- `expiresAt` (TIMESTAMP, indexed)
- `createdAt` (TIMESTAMP, default NOW())

✅ Indexes:
- `message_logs_conversation_id_created_at_idx` (conversationId, createdAt)
- `message_logs_merchant_id_idx` (merchantId)
- `message_logs_expires_at_idx` (expiresAt)

### Conversation Table Updates

✅ New columns added:
- `summary` (TEXT, nullable)
- `memoryFacts` (JSONB, nullable)
- `lastIntent` (TEXT, nullable)
- `lastSummarizedAt` (TIMESTAMP, nullable)

## Conclusion

**AC-01 PASSED**: Migration successfully applied. Schema in sync with Prisma model definitions.
