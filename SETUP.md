ggpull# Setup Instructions - Core V1 MVP

This document provides step-by-step instructions to set up the Closy Bot development environment.

## Prerequisites

Ensure you have the following installed:

- **Node.js** >= 20.0.0 ([Download](https://nodejs.org/))
- **pnpm** >= 10.0.0 (`npm install -g pnpm`)
- **PostgreSQL** 16+ (or Docker for local development)
- **Git**

## Quick Setup (5 minutes)

### 1. Clone the repository

```bash
git clone <repository-url>
cd closy-bot
```

### 2. Install dependencies

```bash
pnpm install
```

This will:
- Install all dependencies in `apps/api`
- Set up the monorepo workspace
- Prepare Prisma Client

### 3. Start PostgreSQL

**Option A: Using Docker Compose (Recommended)**

```bash
docker-compose up -d
```

This starts PostgreSQL on `localhost:5432` with credentials from `docker-compose.yml`.

**Option B: Using your own PostgreSQL**

If you have PostgreSQL installed locally or want to use a remote instance:

1. Create a database named `closy_dev`
2. Update `.env` with your connection string (see step 4)

### 4. Configure environment variables

```bash
cp .env.example .env
```

The default values work with Docker Compose. If using your own PostgreSQL, edit `.env`:

```env
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/closy_dev?schema=public"
NODE_ENV="development"
PORT=3000
LOG_LEVEL="debug"
```

### 5. Run database migrations

```bash
# Generate Prisma Client
pnpm db:generate

# Apply migrations to database
pnpm db:migrate
```

You'll be prompted to name the migration. You can use: `init` or `bootstrap`

### 6. Start the development server

```bash
pnpm dev
```

You should see:

```
🚀 Application is running on: http://localhost:3000
📊 Environment: development
```

### 7. Verify installation

Open another terminal and test the health endpoints:

```bash
# Basic health check
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-02-10T..."}

# Database health check
curl http://localhost:3000/health/db

# Expected response:
# {"status":"ok","timestamp":"2026-02-10T...","latency":5}
```

If both return `"status":"ok"`, you're ready to develop! 🎉

## Development Workflow

### Common commands

```bash
# Start dev server with hot reload
pnpm dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint code
pnpm lint

# Format code
pnpm format

# Build for production
pnpm build
```

### Database commands

```bash
# Generate Prisma Client after schema changes
pnpm db:generate

# Create and apply a new migration
pnpm db:migrate

# Push schema changes without creating migration (dev only)
pnpm db:push

# Open Prisma Studio (DB GUI)
pnpm db:studio
```

## Troubleshooting

### Port 3000 already in use

Change the port in `.env`:

```env
PORT=3001
```

### Port 5432 already in use (PostgreSQL)

If you have another PostgreSQL instance running:

**Option 1:** Stop the other instance
**Option 2:** Change the port in `docker-compose.yml`:

```yaml
ports:
  - '5433:5432'  # Maps container port 5432 to host port 5433
```

Then update `.env`:

```env
DATABASE_URL="postgresql://closy:closy_dev_password@localhost:5433/closy_dev?schema=public"
```

### Prisma Client not generating

Try:

```bash
cd apps/api
pnpm exec prisma generate
```

### Tests fail with "Cannot find module"

Ensure you've run:

```bash
pnpm install
pnpm db:generate
```

### Database connection error

1. Check PostgreSQL is running:
   ```bash
   docker-compose ps
   # Should show closy-postgres as "Up"
   ```

2. Test connection manually:
   ```bash
   psql -h localhost -U closy -d closy_dev
   # Password: closy_dev_password
   ```

3. Check `.env` has correct `DATABASE_URL`

### TypeScript errors

Ensure you're using Node.js >= 20:

```bash
node --version
# Should be v20.x.x or higher
```

## Next Steps

Once your environment is set up:

1. Review [docs/mvp-core-v1.md](../docs/mvp-core-v1.md) for product requirements
2. Check [docs/plan/](../docs/plan/) for implementation plans
3. Follow [.github/copilot-instructions.md](../.github/copilot-instructions.md) when coding
4. Explore module READMEs in `apps/api/src/*/README.md`

## IDE Setup (Optional)

### VS Code

Recommended extensions:

- **Prisma** (prisma.prisma)
- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)
- **GitHub Copilot** (github.copilot)

Settings are already in `.vscode/` (if present).

### TypeScript version

Ensure VS Code uses the workspace TypeScript version:

1. Open any `.ts` file
2. CMD+Shift+P → "TypeScript: Select TypeScript Version"
3. Choose "Use Workspace Version"

## Docker Commands Reference

```bash
# Start PostgreSQL
docker-compose up -d

# Stop PostgreSQL
docker-compose down

# View logs
docker-compose logs -f postgres

# Restart PostgreSQL
docker-compose restart postgres

# Remove all data (⚠️ destructive)
docker-compose down -v
```

## Getting Help

- **Documentation**: `docs/`
- **Agent instructions**: `.github/agents/`
- **Architecture**: [README.md](../README.md)
- **Issues**: Check existing plans in `docs/plan/`

---

**Ready to code?** Start with `pnpm dev` and explore the codebase! 🚀
