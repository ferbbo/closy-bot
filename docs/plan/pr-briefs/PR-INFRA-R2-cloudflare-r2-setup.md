# Brief — PR-INFRA-R2 — Cloudflare R2 Setup: Documentación + Env Config

> **Status**: `DRAFT`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-INFRA-R2-cloudflare-r2-setup.md`
> **Issue**: pendiente (post-BRIEF GATE)
> **Parallel Mode**: `false`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Habilitar almacenamiento de imágenes de productos en Cloudflare R2 mediante documentación de setup paso a paso, declaración de variables de entorno validadas con Joi, y una guía de desarrollo local con MinIO. Este PR es pre-requisito de PR-18 (Product Images API).

## Scope fence

### ✅ Included

- Documento `docs/setup/cloudflare-r2-setup.md` (bucket, credentials, CORS, CDN)
- Sección R2 en `apps/api/.env.example` (5 variables)
- Joi schemas en `apps/api/src/common/config/env.validation.ts`
- Guía local dev con MinIO (docker-compose snippet)
- CDN config docs (R2.dev subdomain + custom domain `cdn.closy.bot`)
- Security best practices (bucket privado, rotación de credentials)

### ❌ Excluded

- Código de integración S3/R2 en la API (eso es PR-18)
- Terraform / IaC automation
- Multi-region replication
- UI de configuración
- Tests E2E o unitarios (no hay código de aplicación en este PR)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear `docs/setup/cloudflare-r2-setup.md` con pasos para crear bucket, generar API credentials (Access Key + Secret), configurar public access y custom domain, y configurar CORS para `localhost:3001` | pendiente | AC-01, AC-02 |
| REQ-02 | Agregar sección `# Cloudflare R2` en `apps/api/.env.example` con las 5 variables requeridas y comentarios descriptivos | pendiente | AC-03 |
| REQ-03 | Agregar Joi schemas para las 5 variables R2 en `env.validation.ts` con tipos correctos (`Joi.string().optional()`) | pendiente | AC-04 |
| REQ-04 | Incluir en la guía una sección "Local Development" con opción MinIO (docker-compose snippet) como alternativa offline a bucket R2 real | pendiente | AC-05 |
| REQ-05 | Incluir en la guía sección "Security Best Practices" (bucket privado por default, public access via CDN únicamente, instrucciones de rotación de credentials) | pendiente | AC-06 |

## Paths a tocar (concretos)

- `docs/setup/cloudflare-r2-setup.md` — **NUEVO** (documentación completa de setup)
- `apps/api/.env.example` — agregar sección R2 al final
- `apps/api/src/common/config/env.validation.ts` — agregar 5 vars con Joi

## Contratos / Interfaces

### Variables de entorno (nuevas)

| Variable | Tipo Joi | Requerida | Default | Descripción |
|---|---|---|---|---|
| `R2_ACCOUNT_ID` | `Joi.string()` | opcional | — | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | `Joi.string()` | opcional | — | R2 API Access Key (S3-compatible) |
| `R2_SECRET_ACCESS_KEY` | `Joi.string()` | opcional | — | R2 API Secret Key |
| `R2_BUCKET_NAME` | `Joi.string()` | opcional | — | Nombre del bucket R2 |
| `R2_PUBLIC_URL` | `Joi.string().uri()` | opcional | — | URL base pública del CDN/R2.dev subdomain |

> Todas opcionales: el módulo de imágenes (PR-18) fallará con error descriptivo si no están presentes al intentar usarlo.

### Endpoint R2 (S3-compatible)

| Campo | Valor |
|---|---|
| Endpoint | `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com` |
| Región | `auto` |
| API compatibility | AWS SDK v3 S3-compatible |

### CORS config recomendada para bucket R2

| Campo | Valor |
|---|---|
| AllowedOrigins | `localhost:3001`, `{dashboard_prod_domain}` |
| AllowedMethods | `GET`, `PUT` |
| AllowedHeaders | `*` |
| MaxAgeSeconds | `3600` |

## Comportamiento

### Happy path (developer siguiendo la guía)

1. Developer abre `docs/setup/cloudflare-r2-setup.md`
2. Crea bucket R2 en Cloudflare dashboard (< 5 min)
3. Genera API credentials (Access Key + Secret) (< 5 min)
4. Configura public access via R2.dev subdomain o custom domain (< 10 min)
5. Configura CORS para permitir `localhost:3001` (< 5 min)
6. Copia variables a `.env` local y verifica que la API arranca sin errores

### Happy path (local offline con MinIO)

1. Developer ejecuta `docker-compose up minio` (snippet en la guía)
2. Configura `R2_*` vars apuntando a MinIO local
3. Puede desarrollar PR-18 sin cuenta Cloudflare

### Edge cases

- Si variables R2 están ausentes: API arranca sin error (opcionales), PR-18 detectará en runtime y retornará 503 con mensaje descriptivo
- Rotación de credentials: guía explica crear nueva key → actualizar `.env` → invalidar key vieja

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `docs/setup/cloudflare-r2-setup.md` existe con todas las secciones: Prerequisitos, Crear Bucket, Generar Credentials, Public Access/CDN, CORS Config, CDN Custom Domain, Security Best Practices | Revisión manual del archivo |
| AC-02 | Developer nuevo puede seguir los pasos y tener R2 operativo en < 30 min | Reviewee confirma lectura completa sin preguntas de ambigüedad |
| AC-03 | `apps/api/.env.example` tiene sección `# Cloudflare R2 (PR-INFRA-R2)` con las 5 variables documentadas con comentarios | `grep R2_ apps/api/.env.example` retorna 5 líneas |
| AC-04 | `env.validation.ts` incluye las 5 variables R2 con Joi types correctos; `npx tsc --noEmit` retorna 0 errores | `npx tsc --noEmit` exits 0 |
| AC-05 | La guía incluye sección "Local Development" con snippet docker-compose para MinIO y variables de entorno equivalentes | Revisión del archivo |
| AC-06 | La guía documenta configuración CORS que permite `localhost:3001` (exacto, con steps de Cloudflare dashboard) | Revisión del archivo |

## Plan de pruebas

- Unit: N/A (no hay código de aplicación)
- Integration: N/A
- Manual:
  - Reviewer valida que la guía es seguible de inicio a fin sin conocimiento previo de R2
  - `npx tsc --noEmit` pasa (único check de código para los cambios en `env.validation.ts`)

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo lo del brief)
- [ ] `npx tsc --noEmit` retorna 0 errores
- [ ] `apps/api/.env.example` y `env.validation.ts` actualizados en el mismo commit
- [ ] Guía cubre setup completo en < 30 min para developer nuevo
- [ ] CORS para `localhost:3001` documentado explícitamente
- [ ] Variables son `optional()` en Joi (no bloquean arranque de API en dev sin R2)
