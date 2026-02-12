# Persistence Module

This module handles database access and persistence layer.

## Structure

- `prisma/` - Prisma service and client configuration
- `repositories/` - Domain-specific repositories

## Repositories (PR-02)

### Implemented
- **MessageRepository** - Inbound message persistence (PR-01)
- **CustomerRepository** - Customer identity with phone uniqueness
- **MerchantRepository** - Merchant with API key uniqueness
- **ConversationRepository** - Conversation session management

### Coming Soon
- CartRepository
- OrderRepository
- ProductRepository
- TicketRepository

## Usage

Repositories are provided globally and can be injected into any service:

```typescript
import { CustomerRepository } from '@/persistence/repositories/customer.repository';

@Injectable()
export class MyService {
  constructor(private readonly customerRepo: CustomerRepository) {}
}
```

## Repository Patterns

### Idempotency Keys
- **CustomerRepository** - `phone` (unique constraint)
- **MerchantRepository** - `apiKey` (unique constraint)
- **MessageRepository** - `messageId` (unique constraint)

### Common Operations
- `create(data)` - Create new entity (throws on duplicate unique key)
- `findById(id)` - Find by primary key
- `findByXxx(xxx)` - Find by unique/indexed field
- `update(id, data)` - Update existing entity

## Guidelines

- All database operations should go through repositories
- Use transactions for operations that modify multiple entities
- Implement unique constraints for idempotency keys
- Repositories should throw Prisma errors (P2002 for unique constraint violations)
- Services layer should handle error translation to domain exceptions
- Follow Prisma best practices: `.github/skills/prisma/`
