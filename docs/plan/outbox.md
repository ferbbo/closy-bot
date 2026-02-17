# Transactional Outbox Pattern — PR-03.9

> Operational documentation for the outbox pattern implementation for WhatsApp outbound messaging.

## Overview

The **transactional outbox pattern** ensures that if a database transaction commits successfully, the associated outbound WhatsApp message will **eventually** be delivered, without dual-write race conditions.

This implementation:
- Persists outbound messages in the `outbox_messages` table
- Uses a worker (OutboxDispatcherService) to process messages asynchronously
- Provides **at-least-once delivery** semantics with best-effort idempotency

## Architecture

```
┌─────────────────┐
│ WhatsAppController │
│  (Webhook)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Orchestrator    │
│  (Process)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OutboxService   │
│  .enqueue()     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ OutboxRepository│────▶│   Postgres      │
│                 │     │ outbox_messages │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ OutboxDispatcher│
                        │   (Worker)      │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ WhatsAppOutbound│
                        │   Service       │
                        └─────────────────┘
```

## Database Schema

### `outbox_messages` table

| Column              | Type                 | Description                                    |
|---------------------|----------------------|------------------------------------------------|
| `id`                | TEXT (CUID)          | Primary key                                    |
| `merchant_id`       | TEXT                 | Foreign key to merchants                       |
| `channel`           | OutboxChannel        | WHATSAPP                                       |
| `type`              | OutboxMessageType    | SEND_TEXT                                      |
| `to`                | TEXT                 | Recipient phone number                         |
| `payload_json`      | JSONB                | Message payload: `{ text, replyToMessageId? }` |
| `dedupe_key`        | TEXT?                | Idempotency key (nullable)                     |
| `status`            | OutboxMessageStatus  | PENDING / SENDING / SENT / FAILED              |
| `attempts`          | INT                  | Retry attempt count                            |
| `next_retry_at`     | TIMESTAMP            | Next retry timestamp (for exponential backoff) |
| `locked_at`         | TIMESTAMP?           | Lock timestamp (worker claim)                  |
| `locked_by`         | TEXT?                | Worker ID (for debugging)                      |
| `last_error`        | TEXT?                | Last error message (truncated)                 |
| `provider_message_id` | TEXT?              | WhatsApp message ID (from API response)        |
| `sent_at`           | TIMESTAMP?           | Timestamp when message was sent                |

**Indexes:**
- `(merchant_id)`
- `(status, next_retry_at)` — for efficient worker queries
- **UNIQUE** `(merchant_id, dedupe_key)` — for idempotency

## Components

### 1. OutboxService

**Purpose:** High-level API for enqueueing messages.

**Key method:**
```typescript
async enqueueWhatsAppText(params: {
  merchantId: string;
  to: string;
  text: string;
  replyToMessageId?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<OutboxMessage>
```

**Idempotency:**
- Generates a default `dedupeKey` if not provided
- On conflict (duplicate `dedupeKey`), returns existing message

**PII safety:**
- Logs masked phone numbers (`***1234`)
- Truncates text in logs

### 2. OutboxRepository

**Purpose:** Low-level data access with raw SQL for `SKIP LOCKED`.

**Key methods:**

#### `create(data): Promise<OutboxMessage>`
- Creates a new message
- On conflict, returns existing message (idempotency)

#### `claimBatch(batchSize, lockId, lockTtlSeconds): Promise<OutboxMessage[]>`
- Claims pending/failed messages using `FOR UPDATE SKIP LOCKED`
- Sets `status = SENDING`, `locked_at = now()`, `locked_by = lockId`
- Reclaims messages with expired locks (stuck in `SENDING`)

#### `markSent(id, providerMessageId): Promise<OutboxMessage>`
- Marks message as `SENT`
- Clears lock fields
- Records `sent_at` and `providerMessageId`

#### `markFailed(id, error, maxAttempts): Promise<OutboxMessage>`
- Increments `attempts`
- Schedules retry with exponential backoff (60s, 120s, 240s, ... capped at 1h)
- Clears lock fields

### 3. OutboxDispatcherService

**Purpose:** Background worker that processes outbox messages.

**Configuration (environment variables):**
- `OUTBOX_DISPATCHER_ENABLED` (default: `true`) — enable/disable worker
- `OUTBOX_BATCH_SIZE` (default: `10`) — batch size per cycle
- `OUTBOX_LOCK_TTL_SECONDS` (default: `300`) — lock TTL for reclaiming stuck messages
- `OUTBOX_MAX_ATTEMPTS` (default: `5`) — max retry attempts

**Behavior:**
- Runs every **10 seconds** (via `@Cron`)
- Claims a batch of messages using `OutboxRepository.claimBatch()`
- For each message:
  - Dispatches `WhatsAppOutboundService.sendTextMessage()`
  - On success: `markSent()`
  - On failure: `markFailed()` with exponential backoff

**Concurrency:**
- Multiple worker instances can run safely (SKIP LOCKED prevents double-processing)
- `locked_by` field records worker ID for debugging

### 4. WhatsAppController (modified)

**Changes:**
- Injects `OutboxService`
- Replaces direct `WhatsAppOutboundService.sendTextMessage()` calls with `OutboxService.enqueueWhatsAppText()`
- Uses `dedupeKey` pattern: `reply:${inboundMessageId}` for automatic idempotency

## Operational Procedures

### Monitoring

**Check pending messages:**
```sql
SELECT status, COUNT(*)
FROM outbox_messages
WHERE status = 'PENDING' OR status = 'FAILED'
GROUP BY status;
```

**Check stuck messages (locked for > 5 min):**
```sql
SELECT id, locked_by, locked_at, attempts
FROM outbox_messages
WHERE status = 'SENDING'
  AND locked_at < NOW() - INTERVAL '5 minutes';
```

**Check failed messages exceeding max attempts:**
```sql
SELECT id, to, last_error, attempts
FROM outbox_messages
WHERE status = 'FAILED'
  AND attempts >= 5
ORDER BY created_at DESC
LIMIT 100;
```

### Troubleshooting

#### Symptom: Messages stuck in `PENDING`

**Possible causes:**
1. Dispatcher is disabled (`OUTBOX_DISPATCHER_ENABLED=false`)
2. No worker instances running
3. Database connectivity issues

**Solution:**
- Check logs for `OutboxDispatcher initialized`
- Verify `OUTBOX_DISPATCHER_ENABLED=true` in `.env`
- Restart application

#### Symptom: Messages stuck in `SENDING`

**Possible causes:**
1. Worker crashed mid-processing (before marking `SENT`/`FAILED`)
2. Lock TTL too short

**Solution:**
- Messages will be reclaimed after `OUTBOX_LOCK_TTL_SECONDS` expires automatically
- Check logs for worker crashes
- Increase `OUTBOX_LOCK_TTL_SECONDS` if needed

#### Symptom: Messages marked `FAILED` with high `attempts`

**Possible causes:**
1. WhatsApp API credentials invalid
2. Network issues
3. Rate limiting

**Solution:**
- Check `last_error` field for details
- Verify `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are correct
- Check WhatsApp API status: https://developers.facebook.com/status/

### Manual retry

To manually retry a failed message:

```sql
UPDATE outbox_messages
SET status = 'PENDING',
    attempts = 0,
    next_retry_at = NOW(),
    locked_at = NULL,
    locked_by = NULL,
    last_error = NULL
WHERE id = '<message-id>';
```

## Idempotency Guarantees

### Best-effort idempotency

**Dedupe by `dedupeKey`:**
- Prevents duplicate enqueues (e.g., retry from orchestrator)
- Implemented via unique constraint `(merchant_id, dedupe_key)`

**NOT covered (edge case):**
- Worker crashes **after** sending to WhatsApp API but **before** marking `SENT`
- This results in duplicate sends (at-least-once delivery)

**Mitigation:**
- Use stable `dedupeKey` pattern (e.g., `reply:${inboundMessageId}`)
- WhatsApp API may dedupe on their side (not guaranteed)
- For critical flows, implement application-level tracking

## Limitations & Future Work

### Out of scope for V1

- **Exactly-once delivery:** Not guaranteed due to crash window
- **Message ordering:** Messages are processed roughly FIFO, but not strictly ordered
- **External queue (Redis/SQS):** Not implemented; using Postgres-only outbox
- **Dead letter queue:** Failed messages remain in table with `status=FAILED`

### Future enhancements

- Add `DEAD_LETTER` status for messages exceeding max attempts
- Implement cleanup job to archive old `SENT` messages
- Add metrics/alerts for stuck/failed messages
- Integrate external queue service for high throughput

## References

- PR Brief: `docs/plan/pr-briefs/PR-03.9-transactional-outbox-whatsapp.md`
- Prisma schema: `prisma/schema.prisma` (OutboxMessage model)
- Repository: `apps/api/src/persistence/repositories/outbox.repository.ts`
- Service: `apps/api/src/persistence/outbox/outbox.service.ts`
- Worker: `apps/api/src/workers/outbox-dispatcher/outbox-dispatcher.service.ts`
