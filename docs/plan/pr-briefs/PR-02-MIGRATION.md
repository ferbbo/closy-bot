# PR-02 Migration Guide

## Prerequisites
- Ensure `.env` has valid `DATABASE_URL`
- PostgreSQL database is running (via `docker-compose up -d` or local instance)

## Migration Steps

### 1. Generate Prisma Client
```bash
pnpm db:generate
```

This updates the Prisma Client with the new models (Customer, Merchant, Conversation).

### 2. Run Migrations
```bash
pnpm db:migrate
```

When prompted for a migration name, use: `add_customer_merchant_conversation`

This will:
- Create `customers` table with phone unique constraint
- Create `merchants` table with api_key unique constraint
- Create `conversations` table with foreign keys
- Add indexes for performance

### 3. (Optional) Seed Test Data
```bash
pnpm db:seed
```

This creates:
- 1 test merchant (API key: `sk_test_dev_merchant_001`)
- 2 test customers with phone numbers
- 2 active conversations

### 4. Verify Migration
```bash
pnpm db:studio
```

Open Prisma Studio and verify:
- Tables `customers`, `merchants`, `conversations` exist
- Unique constraints on `phone` and `api_key`
- Foreign key relationships are correct

## Rollback (if needed)
```bash
# Rollback last migration
pnpm --filter @closy-bot/api exec prisma migrate resolve --rolled-back <migration-name>
```

## Testing

### Run Unit Tests
```bash
pnpm test
```

Expected: All tests pass, including new repository and service tests.

### Run E2E Tests
```bash
pnpm test:e2e
```

Expected: Identity resolution E2E tests pass.

## Validation Checklist

- [ ] `pnpm db:generate` completes without errors
- [ ] `pnpm db:migrate` creates migration successfully
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (unit tests)
- [ ] `pnpm test:e2e` passes (integration tests)
- [ ] Can resolve customer by phone (idempotent)
- [ ] Can create/retrieve conversation by customer+channel
- [ ] Phone normalization works (spaces/dashes removed)
- [ ] PII masked in logs

## Common Issues

### Issue: Migration fails with "relation already exists"
**Solution:** Database has old state. Reset with:
```bash
pnpm --filter @closy-bot/api exec prisma migrate reset
```

### Issue: Tests fail with "cannot find module"
**Solution:** Regenerate Prisma Client:
```bash
pnpm db:generate
```

### Issue: E2E tests timeout
**Solution:** Ensure PostgreSQL is running and DATABASE_URL is correct.

## Next Steps (PR-03)
After verifying PR-02:
- Catalog models (Product, ProductVariant)
- CSV import service
- Product search functionality
