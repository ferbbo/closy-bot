# Deployment Strategy – Closy Bot MVP

> **Última actualización:** 2026-03-10
> **Estado:** Aprobado para MVP
> **Stack:** Fly.io (Backend) + Supabase (DB) + Vercel (Dashboard)

---

## 1. Resumen Ejecutivo

### Decisiones clave

| Decisión | Elección | Razón |
|----------|----------|-------|
| **Backend hosting** | Fly.io (São Paulo) | Latencia óptima para webhooks Meta (~50ms) |
| **Base de datos** | Supabase PostgreSQL | RLS nativo para aislamiento multi-tenant |
| **Dashboard hosting** | Vercel | Deploy Next.js nativo, no crítico en latencia |
| **Multi-tenancy** | RLS (Row Level Security) | Prevención de fuga de datos desde DB level |

### Costos estimados

| Fase | Costo mensual | Componentes |
|------|--------------|-------------|
| **MVP (0-6 meses)** | ~$5-10/mes | Fly.io $5 + Supabase Free + Vercel Free |
| **Growth (6-18 meses)** | ~$50-80/mes | Fly.io $20 + Supabase $25 + Vercel $20 |
| **Scale (18+ meses)** | Variable | Evaluar DB-per-tenant o clusters |

---

## 2. Arquitectura de Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTERNET                                     │
└──────────┬────────────────────────────────────┬─────────────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────┐              ┌──────────────────────┐
│   Meta Webhooks      │              │   Merchants/Users    │
│   (WhatsApp API)     │              │   (Dashboard)        │
└──────────┬───────────┘              └──────────┬───────────┘
           │                                     │
           │ Webhook POST                        │ HTTPS
           │ (timeout: 15s)                      │
           │                                     │
           ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Fly.io (São Paulo - GRU)                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   NestJS API Container                      │  │
│  │                                                             │  │
│  │  • POST /webhooks/whatsapp ← Meta callbacks (latencia <50ms)│  │
│  │  • REST API ← Dashboard calls                               │  │
│  │  • Outbox Dispatcher (cron o polling)                       │  │
│  │                                                             │  │
│  │  Always-on: min_machines_running = 1 (sin cold starts)     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              │ DATABASE_URL (connection pooling)  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL)                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Row Level Security (RLS) ENABLED                          │  │
│  │                                                             │  │
│  │  Tablas protegidas:                                        │  │
│  │  • conversations, message_logs, categories, products       │  │
│  │  • carts, orders, payments, tickets                        │  │
│  │  • channels, outbox_messages, merchant_configs             │  │
│  │                                                             │  │
│  │  Policy: merchant_id = current_setting('app.current_tenant')│  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     Vercel (Global Edge)                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Next.js Dashboard                         │  │
│  │                                                             │  │
│  │  • SSR con Session Cookie auth                             │  │
│  │  • Calls → Fly.io API (con merchantId en session)          │  │
│  │  • Latencia no crítica (torre de control)                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Requisitos de Latencia

### WhatsApp Webhooks (Crítico)

| Métrica | Target | Razón |
|---------|--------|-------|
| **Webhook ACK** | <200ms | Meta timeout es 15s, pero ACK debe ser inmediato |
| **Primera respuesta al usuario** | <3s | UX óptima de chatbot |
| **Response time P95** | <5s | Spec MVP (TFR <5s) |

### Patrón de Procesamiento Recomendado

```typescript
// ⚠️ CRÍTICO: ACK rápido + procesamiento async
@Post('webhooks/whatsapp')
async handleWebhook(@Body() payload: WebhookPayload) {
  // 1. Validar firma Meta (sync, <50ms)
  this.validateSignature(payload);
  
  // 2. Idempotencia: verificar message_id no duplicado
  const exists = await this.messageRepo.existsByProviderId(payload.message_id);
  if (exists) return { status: 'duplicate' };
  
  // 3. Persist en outbox para garantizar no-pérdida
  await this.outboxService.enqueue(payload);
  
  // 4. ACK inmediato a Meta (< 200ms total)
  return { status: 'received' };
}

// Procesamiento real en background (EventEmitter o cron poll)
@OnEvent('inbound.received')
async processMessage(payload: WebhookPayload) {
  // Lógica pesada: LLM, cart, checkout, etc.
}
```

### Dashboard (No crítico)

| Métrica | Target | Razón |
|---------|--------|-------|
| **Page load** | <2s | Standard web |
| **API calls** | <500ms | Aceptable para panel admin |

---

## 4. Row Level Security (RLS)

### ¿Por qué RLS?

- **Prevención de fuga de datos**: Imposible ver datos de otro merchant desde DB level
- **Defensa en profundidad**: Aunque el código tenga bug, la DB bloquea
- **Auditoría**: Políticas explícitas y auditables

### Tablas con RLS

| Tabla | Campo de tenant | RLS Policy |
|-------|-----------------|------------|
| `conversations` | `merchant_id` | ✅ |
| `message_logs` | `merchant_id` | ✅ |
| `categories` | `merchant_id` | ✅ |
| `products` | `merchant_id` | ✅ |
| `carts` | `merchant_id` | ✅ |
| `orders` | `merchant_id` | ✅ |
| `payments` | via `orders.merchant_id` | ✅ (JOIN policy) |
| `tickets` | `merchant_id` | ✅ |
| `channels` | `merchant_id` | ✅ |
| `outbox_messages` | `merchant_id` | ✅ |
| `merchant_configs` | `merchant_id` | ✅ |
| `merchant_identities` | `merchant_id` | ✅ |
| `sessions` | `merchant_id` | ✅ |
| `handoffs` | via `conversations.merchant_id` | ✅ (JOIN policy) |

### Script de Migración RLS

```sql
-- ============================================================================
-- RLS Migration for Multi-Tenant Isolation
-- Run this AFTER Prisma migrations, in Supabase SQL Editor
-- ============================================================================

-- 1. Enable RLS on all tenant-scoped tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;

-- 2. Create policies for tables with direct merchant_id
CREATE POLICY tenant_isolation_conversations ON conversations
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_message_logs ON message_logs
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_categories ON categories
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_products ON products
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_carts ON carts
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_orders ON orders
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_tickets ON tickets
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_channels ON channels
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_outbox ON outbox_messages
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_configs ON merchant_configs
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_identities ON merchant_identities
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_sessions ON sessions
  FOR ALL USING (merchant_id = current_setting('app.current_tenant', true));

-- 3. Policies for tables with indirect merchant_id (via FK)
CREATE POLICY tenant_isolation_product_variants ON product_variants
  FOR ALL USING (
    product_id IN (
      SELECT id FROM products 
      WHERE merchant_id = current_setting('app.current_tenant', true)
    )
  );

CREATE POLICY tenant_isolation_cart_items ON cart_items
  FOR ALL USING (
    cart_id IN (
      SELECT id FROM carts 
      WHERE merchant_id = current_setting('app.current_tenant', true)
    )
  );

CREATE POLICY tenant_isolation_order_items ON order_items
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders 
      WHERE merchant_id = current_setting('app.current_tenant', true)
    )
  );

CREATE POLICY tenant_isolation_payments ON payments
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders 
      WHERE merchant_id = current_setting('app.current_tenant', true)
    )
  );

CREATE POLICY tenant_isolation_handoffs ON handoffs
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations 
      WHERE merchant_id = current_setting('app.current_tenant', true)
    )
  );

-- 4. IMPORTANT: Create bypass role for API service account
-- The API will use this role and SET the tenant before each request
CREATE ROLE closy_api_service NOINHERIT;
GRANT ALL ON ALL TABLES IN SCHEMA public TO closy_api_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO closy_api_service;
```

### Uso desde Prisma (NestJS)

```typescript
// src/persistence/tenant-context.service.ts
import { Injectable, Scope } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set tenant context for RLS before executing queries
   * MUST be called at the start of every request with merchant context
   */
  async setTenant(merchantId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant', $1, true)`,
      merchantId,
    );
  }

  /**
   * Clear tenant context (for safety at end of request)
   */
  async clearTenant(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant', '', true)`,
    );
  }
}
```

```typescript
// Middleware para setear tenant automáticamente
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const merchantId = this.extractMerchantId(req);
    if (merchantId) {
      await this.tenantContext.setTenant(merchantId);
    }
    next();
  }

  private extractMerchantId(req: Request): string | null {
    // From session (dashboard)
    if (req.session?.merchantId) return req.session.merchantId;
    // From API key header (catalog API)
    // ... 
    return null;
  }
}
```

---

## 5. Configuración de Plataformas

### 5.1 Fly.io Configuration

```toml
# fly.toml
app = "closy-bot-api"
primary_region = "gru"  # São Paulo, Brasil

[build]
  dockerfile = "apps/api/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  # Otras variables no-secretas aquí

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false  # ⚠️ CRÍTICO: nunca dormir (webhooks)
  auto_start_machines = true
  min_machines_running = 1    # Siempre 1 activa

[http_service.concurrency]
  type = "requests"
  hard_limit = 250
  soft_limit = 200

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512  # Suficiente para NestJS + Prisma

# Health check para zero-downtime deploys
[[services.http_checks]]
  interval = "10s"
  timeout = "2s"
  grace_period = "10s"
  method = "GET"
  path = "/health"
```

### Secrets (vía CLI)

```bash
# Setear secrets (nunca en fly.toml)
fly secrets set DATABASE_URL="postgresql://..." \
  WHATSAPP_VERIFY_TOKEN="..." \
  WHATSAPP_APP_SECRET="..." \
  SESSION_SECRET="..." \
  --app closy-bot-api
```

### 5.2 Supabase Configuration

1. **Crear proyecto** en [supabase.com](https://supabase.com)
2. **Obtener connection strings**:
   - `DATABASE_URL` → Connection pooling (Transaction mode)
   - `DIRECT_URL` → Direct connection (para migraciones Prisma)

```env
# .env.production
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

3. **Ejecutar migraciones** desde local:

```bash
# Prisma migrations
DATABASE_URL=$DIRECT_URL pnpm prisma migrate deploy

# RLS policies (después de Prisma)
# Ejecutar script SQL de Sección 4 en Supabase SQL Editor
```

### 5.3 Vercel Configuration

```json
// apps/dashboard/vercel.json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "installCommand": "pnpm install --frozen-lockfile",
  "env": {
    "NEXT_PUBLIC_API_URL": "@api_url"
  }
}
```

```bash
# Setear variables de entorno en Vercel
vercel env add API_URL production
# Valor: https://closy-bot-api.fly.dev
```

---

## 6. CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  # 1. Tests (siempre)
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test

  # 2. Deploy API a Fly.io
  deploy-api:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      # Migrations post-deploy
      - run: flyctl ssh console -C "npx prisma migrate deploy"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  # 3. Deploy Dashboard a Vercel (automático con Vercel GitHub integration)
  # No se necesita job - Vercel detecta push a main automáticamente
```

---

## 7. Evolución: De RLS a DB-per-Tenant

### Roadmap de Multi-Tenancy

| Fase | Modelo | Cuándo migrar |
|------|--------|---------------|
| **MVP** | Shared DB + RLS | Ahora |
| **Growth** | Schema-per-tenant | >100 merchants activos |
| **Scale** | DB-per-tenant | Requisitos de compliance o >1000 merchants |

### Preparación en código

```typescript
// src/persistence/tenant-database.service.ts
// Abstracción para migración futura

interface TenantDatabaseStrategy {
  getConnection(merchantId: string): PrismaClient;
}

// Fase 1: Shared DB + RLS (actual)
class SharedDatabaseWithRLS implements TenantDatabaseStrategy {
  constructor(private prisma: PrismaService) {}
  
  getConnection(merchantId: string): PrismaClient {
    // Setear tenant y retornar misma conexión
    this.prisma.$executeRaw`SELECT set_config('app.current_tenant', ${merchantId}, true)`;
    return this.prisma;
  }
}

// Fase 2: Schema-per-tenant (futuro)
class SchemaPerTenant implements TenantDatabaseStrategy {
  getConnection(merchantId: string): PrismaClient {
    // Setear search_path al schema del tenant
    return new PrismaClient({
      datasources: { db: { url: `${BASE_URL}?schema=${merchantId}` } }
    });
  }
}

// Fase 3: DB-per-tenant (futuro lejano)
class DatabasePerTenant implements TenantDatabaseStrategy {
  private connections = new Map<string, PrismaClient>();
  
  getConnection(merchantId: string): PrismaClient {
    if (!this.connections.has(merchantId)) {
      this.connections.set(merchantId, new PrismaClient({
        datasources: { db: { url: this.getDatabaseUrl(merchantId) } }
      }));
    }
    return this.connections.get(merchantId)!;
  }
}
```

---

## 8. Checklist de Deployment

### Pre-deployment

- [ ] Tests passing (`pnpm test`)
- [ ] Build exitoso (`pnpm build`)
- [ ] TypeScript sin errores (`npx tsc --noEmit`)
- [ ] Variables de entorno documentadas en `.env.example`

### Primer deployment

- [ ] Crear proyecto Supabase
- [ ] Configurar connection strings en Fly.io secrets
- [ ] Crear app Fly.io (`fly launch --no-deploy`)
- [ ] Deploy API (`fly deploy`)
- [ ] Ejecutar migraciones Prisma
- [ ] Ejecutar script RLS en Supabase SQL Editor
- [ ] Verificar webhook Meta recibe 200 OK
- [ ] Conectar repo a Vercel para dashboard

### Post-deployment validación

- [ ] Health check responde: `GET /health` → 200
- [ ] Webhook test: `POST /webhooks/whatsapp` → 200
- [ ] Dashboard login funcional
- [ ] RLS validado: query sin tenant context falla

---

## 9. Referencias

- [Fly.io Documentation](https://fly.io/docs/)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Prisma with Supabase](https://www.prisma.io/docs/guides/database/supabase)
- [Vercel Next.js Deployment](https://vercel.com/docs/frameworks/nextjs)
