# Closy Bot - Core V1 MVP

WhatsApp-first conversational commerce platform for PYMEs (Ropa, Belleza, Minimarket).

## 🎯 What is this?

A **sales + support** chatbot that converts WhatsApp conversations into orders with:

- 🛍️ Conversational catalog browsing and cart management
- 💳 Checkout with multiple payment methods
- 📦 Order tracking and post-sale support
- 🤖 Smart handoff to human agents
- 📊 Business metrics and funnel analytics

## 🏗️ Architecture

```
apps/api/src/
├── channels/      # WhatsApp adapter + message normalization
├── domain/        # Core entities (cart, order, ticket)
├── services/      # External integrations (catalog, payments)
├── persistence/   # Prisma + repositories
├── orchestrator/  # Intent classification + flow engine
├── analytics/     # Events + metrics
└── common/        # Config, health, shared utilities
```

## 📋 Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 10.0.0
- **PostgreSQL** 16+ (or use Docker Compose)

## 🚀 Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL

Using Docker Compose:

```bash
docker-compose up -d
```

Or use your own PostgreSQL instance and update `.env` with connection string.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if needed (default values work with docker-compose).

### 4. Run migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Start development server

```bash
pnpm dev
```

The API will be available at `http://localhost:3000`

### 6. Verify installation

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

curl http://localhost:3000/health/db
# Expected: {"status":"ok","timestamp":"...","latency":10}
```

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:cov` | Run tests with coverage |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Prisma Studio |

## 📁 Project Structure

```
closy-bot/
├── apps/
│   └── api/              # NestJS API application
│       ├── src/
│       ├── test/
│       └── package.json
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Migration files
├── docs/
│   ├── mvp-core-v1.md   # Product specification
│   └── plan/            # Implementation plans
├── .github/
│   ├── copilot-instructions.md  # Repo constitution
│   ├── agents/          # Agent definitions
│   ├── instructions/    # Language-specific rules
│   └── skills/          # Domain skills (Prisma, NestJS)
├── docker-compose.yml   # PostgreSQL for local dev
├── .env.example         # Environment template
└── pnpm-workspace.yaml  # Monorepo config
```

## 🧪 Testing

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:cov

# Run E2E tests
pnpm test:e2e
```

## 📖 Documentation

- [MVP Specification](docs/mvp-core-v1.md) - Full product requirements and scope
- [Bootstrap Plan](docs/plan/bootstrap.md) - Initial setup implementation plan
- [Repo Instructions](.github/copilot-instructions.md) - Development rules and guidelines
- [Agent Definitions](.github/agents/) - Copilot agent behaviors

## 🔒 Non-Negotiable Rules

From `.github/copilot-instructions.md`:

1. **Idempotency**: Never process the same webhook twice
   - Inbound messages: dedupe by `message_id`
   - Payment webhooks: dedupe by `payment_intent_id`

2. **State is persisted**: All business state in PostgreSQL

3. **LLM guardrails**: AI never invents stock/prices/policies

4. **Minimal PII**: Store only required data, mask in logs

## 🧩 Tech Stack

- **Runtime**: Node.js 20 + TypeScript 5
- **Framework**: NestJS 10
- **Database**: PostgreSQL 16 + Prisma ORM
- **Testing**: Jest + Supertest
- **Validation**: class-validator + Joi
- **Package Manager**: pnpm

## 📊 Current Status

✅ Bootstrap complete:
- NestJS application structure
- Prisma + PostgreSQL setup
- Module architecture (placeholder)
- Health check endpoints
- Testing infrastructure

🚧 In progress:
- Business logic implementation (see `docs/plan/`)

## 🤝 Contributing

This is a private MVP project. Please follow:

1. Review [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for coding rules
2. Check [agent definitions](.github/agents/) for development workflows
3. Keep changes small and testable
4. Follow DoD checklist before submitting PRs

## 🔗 Related Documents

- [AGENTS.md](AGENTS.md) - Workspace guardrails for Copilot agents
- [TypeScript Guidelines](.github/instructions/typescript-5-es2022.instructions.md)
- [NestJS Best Practices](.github/skills/nestjs-best-practices/SKILL.md)
- [Prisma Patterns](.github/skills/prisma/SKILL.md)

## 📝 License

UNLICENSED - Private project

---

**Need help?** Check documentation in `docs/` or agent instructions in `.github/agents/`
