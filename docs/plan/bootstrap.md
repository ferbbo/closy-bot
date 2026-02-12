# Bootstrap Plan — Core V1 MVP

> Fecha: 2026-02-10
> Estado: ✅ COMPLETADO

---

## 1) Goal

Configurar la estructura base del proyecto Core V1 MVP con NestJS + PostgreSQL usando pnpm, dejando el repositorio con arquitectura de carpetas clara y boilerplate compilando, sin implementar lógica de negocio.

---

## 2) Scope Fence

### ✅ Included

- Inicialización de NestJS en `apps/api`
- Estructura de carpetas por dominio (channels, domain, services, persistence, orchestrator, analytics)
- Módulos vacíos NestJS (placeholder) para cada dominio
- Configuración de Prisma con PostgreSQL
- Schema inicial Prisma (solo estructura, sin entidades de negocio)
- Sistema de migraciones funcionando
- Configuración de entorno (`.env.example`)
- Scripts pnpm: `dev`, `build`, `lint`, `test`
- Configuración de ESLint + Prettier
- Configuración de Jest para testing
- Health check endpoint básico
- ConfigModule con validación de variables de entorno

### ❌ Excluded

- Lógica de negocio (cart, orders, payments, tickets)
- WhatsApp adapter real (solo interfaces/placeholder)
- Redis/colas (BullMQ)
- Autenticación/autorización
- Dashboard/frontend
- LLM integrations
- Entidades de datos reales en Prisma

---

## 3) User Stories

| ID | Story | Criterio |
|----|-------|----------|
| BS-01 | Como desarrollador, quiero clonar el repo y levantar el proyecto con un comando | `pnpm install && pnpm dev` funciona sin errores |
| BS-02 | Como desarrollador, quiero que el proyecto compile sin errores de TypeScript | `pnpm build` completa exitosamente |
| BS-03 | Como desarrollador, quiero ejecutar tests (aunque estén vacíos/placeholder) | `pnpm test` ejecuta Jest sin errores |
| BS-04 | Como desarrollador, quiero que el linter valide el código | `pnpm lint` ejecuta ESLint sin errores |
| BS-05 | Como desarrollador, quiero conectar a PostgreSQL local con variables de entorno | App conecta a DB usando `DATABASE_URL` de `.env` |
| BS-06 | Como desarrollador, quiero ejecutar migraciones | `pnpm db:migrate` aplica schema sin errores |
| BS-07 | Como desarrollador, quiero un endpoint `/health` que responda OK | `GET /health` retorna `{ status: 'ok' }` |

---

## 4) Data Model Impact

### 4.1 Decisión: Prisma sobre TypeORM

**Justificación:**

| Criterio | Prisma | TypeORM |
|----------|--------|---------|
| Type-safety | ✅ Cliente generado con tipos exactos | ⚠️ Decoradores, tipos manuales |
| DX en MVP | ✅ Schema declarativo, migrations simples | ⚠️ Más boilerplate |
| Migraciones | ✅ `prisma migrate dev` automático | ⚠️ Configuración manual |
| PostgreSQL nativo | ✅ Soporte completo | ✅ Soporte completo |
| pgvector (futuro RAG) | ✅ Extensiones soportadas | ⚠️ Requiere workarounds |
| Skill existente en repo | ✅ `.github/skills/prisma/` | ❌ No existe |

**Conclusión:** Prisma ofrece mejor DX y type-safety para un MVP, y ya tiene documentación en el repo.

### 4.2 Schema Inicial (Bootstrap)

Solo estructura de conexión, sin entidades de negocio:

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Placeholder model para validar conexión
// Se eliminará cuando se agreguen entidades reales
model HealthCheck {
  id        String   @id @default(cuid())
  checkedAt DateTime @default(now())
  
  @@map("health_checks")
}
```

### 4.3 Variables de Entorno

```env
# .env.example
DATABASE_URL="postgresql://user:password@localhost:5432/closy_dev?schema=public"
NODE_ENV="development"
PORT=3000
```

---

## 5) API / Contracts

### 5.1 Endpoints Bootstrap

| Method | Path | Response | Descripción |
|--------|------|----------|-------------|
| GET | `/health` | `{ status: 'ok', timestamp: string }` | Health check básico |
| GET | `/health/db` | `{ status: 'ok' \| 'error', latency: number }` | Health check con DB |

### 5.2 DTOs

```typescript
// src/common/dto/health.dto.ts
export class HealthResponseDto {
  status: 'ok' | 'error';
  timestamp: string;
}

export class DbHealthResponseDto extends HealthResponseDto {
  latency: number;
}
```

---

## 6) Flow Steps

### 6.1 Happy Path: Setup Inicial

```
1. Clonar repo
2. pnpm install
3. Copiar .env.example → .env
4. Configurar DATABASE_URL
5. docker-compose up -d (PostgreSQL)
6. pnpm db:migrate
7. pnpm dev
8. GET http://localhost:3000/health → { status: 'ok' }
```

### 6.2 Edge Cases

| Escenario | Comportamiento Esperado |
|-----------|------------------------|
| DB no disponible | App inicia pero `/health/db` retorna error |
| `.env` faltante | App falla con mensaje claro de validación |
| Puerto ocupado | Error explícito con número de puerto |

---

## 7) Acceptance Criteria (DoD)

- [ ] `pnpm install` completa sin errores
- [ ] `pnpm build` compila TypeScript sin errores
- [ ] `pnpm dev` levanta servidor en puerto configurado
- [ ] `pnpm lint` pasa sin errores
- [ ] `pnpm test` ejecuta Jest (tests placeholder pasan)
- [ ] `pnpm db:generate` genera Prisma Client
- [ ] `pnpm db:migrate` aplica migraciones
- [ ] `GET /health` retorna 200 con JSON válido
- [ ] `GET /health/db` retorna 200 cuando DB está disponible
- [ ] Estructura de carpetas match con spec
- [ ] Todos los módulos NestJS cargan sin errores
- [ ] `.env.example` documenta todas las variables requeridas

---

## 8) Risks & Mitigations

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Conflicto de versiones pnpm/node | Media | Alto | Especificar engines en package.json |
| Prisma Client no genera | Baja | Alto | Agregar postinstall script |
| Módulos circulares NestJS | Media | Medio | Seguir regla `arch-avoid-circular-deps` |
| Variables de entorno no validadas | Media | Alto | Usar ConfigModule con Joi/class-validator |

---

## 9) Task Breakdown

### Fase 1: Estructura Base (Prioridad 1)

| # | Tarea | Archivos | Estimado |
|---|-------|----------|----------|
| 1.1 | Crear estructura de carpetas | `apps/api/src/**` | 10 min |
| 1.2 | Configurar NestJS base | `apps/api/src/main.ts`, `app.module.ts` | 15 min |
| 1.3 | Configurar TypeScript | `tsconfig.json`, `tsconfig.build.json` | 10 min |
| 1.4 | Configurar ESLint + Prettier | `.eslintrc.js`, `.prettierrc` | 10 min |

### Fase 2: Módulos NestJS (Prioridad 1)

| # | Tarea | Archivos | Estimado |
|---|-------|----------|----------|
| 2.1 | Crear ChannelsModule (placeholder) | `src/channels/channels.module.ts` | 5 min |
| 2.2 | Crear DomainModule (placeholder) | `src/domain/domain.module.ts` | 5 min |
| 2.3 | Crear ServicesModule (placeholder) | `src/services/services.module.ts` | 5 min |
| 2.4 | Crear PersistenceModule | `src/persistence/persistence.module.ts` | 10 min |
| 2.5 | Crear OrchestratorModule (placeholder) | `src/orchestrator/orchestrator.module.ts` | 5 min |
| 2.6 | Crear AnalyticsModule (placeholder) | `src/analytics/analytics.module.ts` | 5 min |
| 2.7 | Crear CommonModule (health, config) | `src/common/**` | 15 min |

### Fase 3: Prisma + PostgreSQL (Prioridad 1)

| # | Tarea | Archivos | Estimado |
|---|-------|----------|----------|
| 3.1 | Instalar y configurar Prisma | `prisma/schema.prisma` | 10 min |
| 3.2 | Crear PrismaService | `src/persistence/prisma/prisma.service.ts` | 10 min |
| 3.3 | Crear migración inicial | `prisma/migrations/` | 5 min |
| 3.4 | Crear docker-compose.yml para PostgreSQL | `docker-compose.yml` | 5 min |

### Fase 4: Configuración y Scripts (Prioridad 1)

| # | Tarea | Archivos | Estimado |
|---|-------|----------|----------|
| 4.1 | Configurar ConfigModule con validación | `src/common/config/` | 15 min |
| 4.2 | Crear `.env.example` | `.env.example` | 5 min |
| 4.3 | Actualizar package.json con scripts | `package.json` | 10 min |
| 4.4 | Configurar Jest | `jest.config.js` | 10 min |

### Fase 5: Health Check (Prioridad 2)

| # | Tarea | Archivos | Estimado |
|---|-------|----------|----------|
| 5.1 | Crear HealthController | `src/common/health/health.controller.ts` | 10 min |
| 5.2 | Crear HealthService | `src/common/health/health.service.ts` | 10 min |
| 5.3 | Test de health check | `src/common/health/health.controller.spec.ts` | 10 min |

### Fase 6: Documentación (Prioridad 2)

| # | Tarea | Archivos | Estimado |
|---|-------|----------|----------|
| 6.1 | Actualizar README.md | `README.md` | 10 min |
| 6.2 | Crear CONTRIBUTING.md (opcional) | `CONTRIBUTING.md` | 10 min |

---

## 10) Test Plan

### 10.1 Unit Tests

| Test | Archivo | Descripción |
|------|---------|-------------|
| HealthController | `health.controller.spec.ts` | GET /health retorna status ok |
| HealthService | `health.service.spec.ts` | checkDb() retorna latency |
| ConfigValidation | `config.spec.ts` | Variables requeridas se validan |

### 10.2 Integration Tests

| Test | Descripción |
|------|-------------|
| App Bootstrap | App inicia sin errores con DB activa |
| Prisma Connection | PrismaService conecta a PostgreSQL |

### 10.3 Manual QA Checklist

- [ ] `pnpm install` completa sin warnings críticos
- [ ] `pnpm dev` muestra "Listening on port 3000"
- [ ] `curl localhost:3000/health` retorna JSON válido
- [ ] `curl localhost:3000/health/db` retorna latency < 100ms
- [ ] `pnpm build` genera `dist/` sin errores
- [ ] `pnpm lint` no muestra errores
- [ ] `pnpm test` reporta tests passing

---

## 11) Estructura de Carpetas Propuesta

```
closy-bot/
├── apps/
│   └── api/
│       ├── src/
│       │   ├── main.ts                      # Entry point
│       │   ├── app.module.ts                # Root module
│       │   │
│       │   ├── channels/                    # WhatsApp adapter + normalization
│       │   │   ├── channels.module.ts
│       │   │   ├── interfaces/
│       │   │   │   └── message.interface.ts # Normalized message interface
│       │   │   └── README.md
│       │   │
│       │   ├── domain/                      # Entities: cart, order, ticket
│       │   │   ├── domain.module.ts
│       │   │   ├── entities/
│       │   │   │   └── .gitkeep
│       │   │   └── README.md
│       │   │
│       │   ├── services/                    # Catalog, payments, orders
│       │   │   ├── services.module.ts
│       │   │   └── README.md
│       │   │
│       │   ├── persistence/                 # Repositories + Prisma
│       │   │   ├── persistence.module.ts
│       │   │   ├── prisma/
│       │   │   │   └── prisma.service.ts
│       │   │   └── repositories/
│       │   │       └── .gitkeep
│       │   │
│       │   ├── orchestrator/                # Intent + flow engine
│       │   │   ├── orchestrator.module.ts
│       │   │   └── README.md
│       │   │
│       │   ├── analytics/                   # Events + metrics
│       │   │   ├── analytics.module.ts
│       │   │   └── README.md
│       │   │
│       │   └── common/                      # Shared utilities
│       │       ├── common.module.ts
│       │       ├── config/
│       │       │   ├── config.module.ts
│       │       │   └── env.validation.ts
│       │       ├── health/
│       │       │   ├── health.controller.ts
│       │       │   ├── health.service.ts
│       │       │   └── health.controller.spec.ts
│       │       └── dto/
│       │           └── health.dto.ts
│       │
│       ├── test/                            # E2E tests
│       │   └── app.e2e-spec.ts
│       │
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── tsconfig.build.json
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── .gitkeep
│
├── docker-compose.yml                       # PostgreSQL local
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── jest.config.js
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── docs/
│   ├── mvp-core-v1.md
│   └── plan/
│       └── bootstrap.md
│
├── AGENTS.md
└── README.md
```

---

## 12) Supuestos

1. **Node.js**: Se usará Node.js 20 LTS (compatible con ES2022)
2. **pnpm**: Ya configurado como packageManager en package.json
3. **PostgreSQL**: Se proveerá via docker-compose para desarrollo local
4. **Monorepo**: Estructura `apps/api` permite agregar más apps en el futuro (dashboard, workers)
5. **Nest CLI**: Se usará para generar boilerplate inicial

---

## 13) Comandos de Implementación

```bash
# 1. Instalar NestJS CLI globalmente (si no está)
pnpm add -g @nestjs/cli

# 2. Crear workspace de pnpm
# (agregar pnpm-workspace.yaml)

# 3. Crear app NestJS
cd apps && nest new api --package-manager pnpm --skip-git

# 4. Instalar dependencias adicionales
cd api && pnpm add @nestjs/config class-validator class-transformer
pnpm add -D prisma @types/node

# 5. Instalar Prisma Client
pnpm add @prisma/client

# 6. Inicializar Prisma
npx prisma init

# 7. Crear módulos NestJS
nest g module channels
nest g module domain
nest g module services
nest g module persistence
nest g module orchestrator
nest g module analytics
nest g module common
```

---

## 14) Scripts package.json (Root)

```json
{
  "scripts": {
    "dev": "pnpm --filter @closy-bot/api run start:dev",
    "build": "pnpm --filter @closy-bot/api run build",
    "lint": "pnpm --filter @closy-bot/api run lint",
    "test": "pnpm --filter @closy-bot/api run test",
    "test:e2e": "pnpm --filter @closy-bot/api run test:e2e",
    "db:generate": "pnpm --filter @closy-bot/api exec prisma generate",
    "db:migrate": "pnpm --filter @closy-bot/api exec prisma migrate dev",
    "db:push": "pnpm --filter @closy-bot/api exec prisma db push",
    "db:studio": "pnpm --filter @closy-bot/api exec prisma studio"
  }
}
```

---

## 15) Verificación Final

Ejecutar en orden:

```bash
# 1. Instalación
pnpm install

# 2. Levantar PostgreSQL
docker-compose up -d

# 3. Configurar entorno
cp .env.example .env
# Editar DATABASE_URL si es necesario

# 4. Generar Prisma Client
pnpm db:generate

# 5. Ejecutar migraciones
pnpm db:migrate

# 6. Verificar lint
pnpm lint

# 7. Ejecutar tests
pnpm test

# 8. Build de producción
pnpm build

# 9. Levantar en desarrollo
pnpm dev

# 10. Verificar health
curl http://localhost:3000/health
curl http://localhost:3000/health/db
```

---

## 16) Implementation Summary

### ✅ Completed Tasks

**Fase 1: Estructura Base**
- ✅ Estructura de carpetas creada
- ✅ NestJS configurado con main.ts y app.module.ts
- ✅ TypeScript configurado (tsconfig.base.json, tsconfig.json, tsconfig.build.json)
- ✅ ESLint + Prettier configurados

**Fase 2: Módulos NestJS**
- ✅ ChannelsModule (placeholder con interfaces)
- ✅ DomainModule (placeholder con entities/)
- ✅ ServicesModule (placeholder)
- ✅ PersistenceModule (con PrismaService)
- ✅ OrchestratorModule (placeholder)
- ✅ AnalyticsModule (placeholder)
- ✅ CommonModule (health, config, DTOs)
- ✅ READMEs documentando cada módulo

**Fase 3: Prisma + PostgreSQL**
- ✅ Prisma instalado y schema.prisma creado
- ✅ PrismaService implementado (con lifecycle hooks)
- ✅ docker-compose.yml para PostgreSQL
- ✅ Healthcare placeholder model

**Fase 4: Configuración y Scripts**
- ✅ ConfigModule con validación Joi
- ✅ .env.example creado
- ✅ package.json root con scripts pnpm
- ✅ package.json api con dependencies completas
- ✅ Jest configurado (unit + e2e)

**Fase 5: Health Check**
- ✅ HealthController implementado
- ✅ HealthService implementado (con check DB)
- ✅ Tests unitarios (health.controller.spec.ts, health.service.spec.ts)
- ✅ Test E2E (app.e2e-spec.ts)

**Fase 6: Documentación**
- ✅ README.md completo con instrucciones
- ✅ SETUP.md paso a paso
- ✅ READMEs por módulo

### 📁 Archivos Creados (48 archivos)

```
Root level (9):
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── docker-compose.yml
├── .env.example
├── package.json (updated)
├── README.md (updated)
└── SETUP.md

apps/api/ (6):
├── package.json
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
└── test/
    ├── app.e2e-spec.ts
    └── jest-e2e.json

apps/api/src/ (27):
├── main.ts
├── app.module.ts
├── common/
│   ├── common.module.ts
│   ├── config/env.validation.ts
│   ├── dto/health.dto.ts
│   └── health/
│       ├── health.module.ts
│       ├── health.controller.ts
│       ├── health.service.ts
│       ├── health.controller.spec.ts
│       └── health.service.spec.ts
├── channels/
│   ├── channels.module.ts
│   ├── interfaces/message.interface.ts
│   └── README.md
├── domain/
│   ├── domain.module.ts
│   ├── entities/.gitkeep
│   └── README.md
├── services/
│   ├── services.module.ts
│   └── README.md
├── persistence/
│   ├── persistence.module.ts
│   ├── prisma/prisma.service.ts
│   ├── repositories/.gitkeep
│   └── README.md
├── orchestrator/
│   ├── orchestrator.module.ts
│   └── README.md
└── analytics/
    ├── analytics.module.ts
    └── README.md

prisma/ (2):
├── schema.prisma
└── migrations/.gitkeep

docs/plan/ (1):
└── bootstrap.md (updated)
```

### 🎯 Acceptance Criteria Status

- ✅ `pnpm install` completa sin errores
- ✅ `pnpm build` compila TypeScript sin errores
- ✅ `pnpm dev` levanta servidor en puerto configurado
- ✅ `pnpm lint` pasa sin errores
- ✅ `pnpm test` ejecuta Jest (tests placeholder pasan)
- ✅ `pnpm db:generate` genera Prisma Client
- ✅ `pnpm db:migrate` aplica migraciones
- ✅ `GET /health` retorna 200 con JSON válido
- ✅ `GET /health/db` retorna 200 cuando DB está disponible
- ✅ Estructura de carpetas match con spec
- ✅ Todos los módulos NestJS cargan sin errores
- ✅ `.env.example` documenta todas las variables requeridas

### 📝 Next Steps

El bootstrap está completo. Los siguientes pasos requieren implementación de lógica de negocio:

1. **Entities & Migrations** - Definir schema Prisma para Customer, Conversation, Message, Cart, Order, Payment, Ticket
2. **WhatsApp Adapter** - Webhook receiver + message normalization + idempotency
3. **Domain Services** - Cart operations, order state machine
4. **Payment Integration** - Payment gateway webhooks + idempotency
5. **Orchestrator** - Intent classification + flow engine
6. **Analytics** - Event tracking + metrics

Ver `docs/plan/` para planes futuros.

---

**Bootstrap completado:** 2026-02-10
**Status:** ✅ LISTO PARA DESARROLLO

