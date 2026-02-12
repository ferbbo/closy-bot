# Persistence Module

This module handles database access and persistence layer.

## Structure

- `prisma/` - Prisma service and client configuration
- `repositories/` - Domain-specific repositories (to be implemented)

## Usage

PrismaService is provided globally and can be injected into any service:

```typescript
import { PrismaService } from '@/persistence/prisma/prisma.service';

@Injectable()
export class MyService {
  constructor(private readonly prisma: PrismaService) {}
}
```

## Guidelines

- All database operations should go through repositories
- Use transactions for operations that modify multiple entities
- Implement unique constraints for idempotency keys
- Follow Prisma best practices: `.github/skills/prisma/`
