---
name: nestjs-best-practices
description: NestJS best practices and architecture patterns for building production-ready applications. Use this skill when writing, reviewing, or refactoring NestJS code for the Core V1 MVP (webhooks, idempotency, Postgres persistence, validation, security, and tests).
license: MIT
metadata:
  author: Kadajett (modified for Core V1 MVP)
  version: "1.1.0-corev1"
---

# NestJS Best Practices (Core V1 MVP)

This skill curates the most relevant NestJS best-practices for **Core V1 MVP** (WhatsApp-first conversational commerce) using **NestJS + TypeScript + PostgreSQL**.

It links to rule files under:

- `references/rules/` — individual rules (one per file)

> Keep this `SKILL.md` as an index + guidance. Rules remain as separate markdown files.

## When to Apply

Use this skill when you are:

- Creating/Refactoring NestJS **modules/controllers/services**
- Building **webhook endpoints** (WhatsApp + payment callbacks)
- Implementing **idempotency**, **state machines**, and **DB transactions**
- Adding **validation**, **guards**, **interceptors**, and **exception filters**
- Writing **unit/integration tests** (duplicate webhooks, state transitions)

## What “good” looks like for this repo

- **Idempotency first** (no double-processing):
  - message webhook: dedupe by provider `message_id`
  - payment webhook: dedupe by `payment_intent_id`
- **Persisted state** in Postgres for conversation/cart/order/payment/tickets.
- **LLM guardrails**: bot never invents price/stock/policies.
- **Small diffs + tests** for critical paths.

---

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|---:|---|---|---|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Dependency Injection | CRITICAL | `di-` |
| 3 | Error Handling | HIGH | `error-` |
| 4 | Security | HIGH | `security-` |
| 5 | Performance | HIGH | `perf-` |
| 6 | Testing | MEDIUM-HIGH | `test-` |
| 7 | Database & ORM | MEDIUM-HIGH | `db-` |
| 8 | API Design | MEDIUM | `api-` |
| 9 | Microservices | MEDIUM | `micro-` |
| 10 | DevOps & Deployment | LOW-MEDIUM | `devops-` |

---

# Quick Reference (Curated for Core V1 MVP)

Below are the rules most relevant to **webhooks + transactions + Postgres** and clean NestJS structure.

## 1) Architecture (CRITICAL)

- [`arch-avoid-circular-deps`](references/rules/arch-avoid-circular-deps.md) — avoid circular module deps
- [`arch-feature-modules`](references/rules/arch-feature-modules.md) — organize by feature/domain, not technical layer
- [`arch-module-sharing`](references/rules/arch-module-sharing.md) — proper exports/imports; avoid duplicate providers
- [`arch-single-responsibility`](references/rules/arch-single-responsibility.md) — prevent “god services”
- [`arch-use-repository-pattern`](references/rules/arch-use-repository-pattern.md) — isolate DB logic for testability
- [`arch-use-events`](references/rules/arch-use-events.md) — decouple via events (optional, but helpful)

**Core V1 add-on (project specific):**
- Use **workflow/state transitions** as explicit service methods (e.g., `OrderService.confirmPayment(...)`) and persist status changes.

## 2) Dependency Injection (CRITICAL)

- [`di-prefer-constructor-injection`](references/rules/di-prefer-constructor-injection.md) — constructor injection
- [`di-use-interfaces-tokens`](references/rules/di-use-interfaces-tokens.md) — injection tokens for interfaces (e.g., PaymentProvider)
- [`di-scope-awareness`](references/rules/di-scope-awareness.md) — understand singleton/request/transient
- [`di-avoid-service-locator`](references/rules/di-avoid-service-locator.md) — avoid service locator anti-pattern

## 3) Error Handling (HIGH)

- [`error-use-exception-filters`](references/rules/error-use-exception-filters.md) — centralized exception handling
- [`error-throw-http-exceptions`](references/rules/error-throw-http-exceptions.md) — use Nest HTTP exceptions
- [`error-handle-async-errors`](references/rules/error-handle-async-errors.md) — async safety (webhooks)

**Core V1 focus:**
- Webhook handlers must be defensive: invalid payload → safe 4xx; internal error → log correlation IDs.

## 4) Security (HIGH)

- [`security-validate-all-input`](references/rules/security-validate-all-input.md) — validate with DTO + pipes
- [`security-use-guards`](references/rules/security-use-guards.md) — guards for protected routes
- [`security-rate-limiting`](references/rules/security-rate-limiting.md) — rate limit public webhook endpoints
- [`security-sanitize-output`](references/rules/security-sanitize-output.md) — prevent XSS in rendered content
- [`security-auth-jwt`](references/rules/security-auth-jwt.md) — JWT auth (for dashboard/admin)

**Core V1 focus:**
- Webhooks: validate signature/secret when provider supports it.
- Mask PII in logs.

## 5) Performance (HIGH)

- [`perf-optimize-database`](references/rules/perf-optimize-database.md) — indexes, query shape
- [`perf-use-caching`](references/rules/perf-use-caching.md) — cache catalog reads (optional)
- [`perf-lazy-loading`](references/rules/perf-lazy-loading.md) — lazy modules (optional)
- [`perf-async-hooks`](references/rules/perf-async-hooks.md) — avoid blocking in lifecycle hooks

## 6) Testing (MEDIUM-HIGH)

- [`test-use-testing-module`](references/rules/test-use-testing-module.md) — Nest TestingModule patterns
- [`test-e2e-supertest`](references/rules/test-e2e-supertest.md) — integration/E2E with Supertest
- [`test-mock-external-services`](references/rules/test-mock-external-services.md) — mock providers (WhatsApp, payment)

**Core V1 must-have tests:**
- duplicate inbound message (`message_id` repeated) → processed once
- repeated payment webhook (`payment_intent_id`) → state transition once

## 7) Database & ORM (MEDIUM-HIGH)

- [`db-use-transactions`](references/rules/db-use-transactions.md) — atomic state transitions
- [`db-use-migrations`](references/rules/db-use-migrations.md) — schema changes via migrations
- [`db-avoid-n-plus-one`](references/rules/db-avoid-n-plus-one.md) — query efficiency

**Core V1 focus:**
- Put **unique constraints** on idempotency keys (`message_id`, `payment_intent_id`).
- Prefer transaction boundaries around order + payment writes.

## 8) API Design (MEDIUM)

- [`api-use-pipes`](references/rules/api-use-pipes.md) — input transform/validation
- [`api-use-interceptors`](references/rules/api-use-interceptors.md) — logging, response shaping
- [`api-use-dto-serialization`](references/rules/api-use-dto-serialization.md) — safe output DTOs
- [`api-versioning`](references/rules/api-versioning.md) — optional for public APIs

## 9) Microservices (MEDIUM) — optional for V1

- [`micro-use-health-checks`](references/rules/micro-use-health-checks.md) — health endpoints
- [`micro-use-queues`](references/rules/micro-use-queues.md) — background jobs (optional)
- [`micro-use-patterns`](references/rules/micro-use-patterns.md) — event/message patterns

## 10) DevOps & Deployment (LOW-MEDIUM)

- [`devops-use-config-module`](references/rules/devops-use-config-module.md) — ConfigModule + env schema
- [`devops-use-logging`](references/rules/devops-use-logging.md) — structured logs + correlation IDs
- [`devops-graceful-shutdown`](references/rules/devops-graceful-shutdown.md) — clean shutdown

---

## How to Use (for Copilot)

When generating or refactoring NestJS code:

1) Follow the **Quick Reference** rules above first.
2) For details and examples, open the linked rule file under `references/rules/`.
3) If a rule conflicts with repo-level instructions (`AGENTS.md`, `.github/copilot-instructions.md`), **repo instructions win**.

---

## Rule Index (by file)

Open these files for full guidance:

- `references/rules/_sections.md`
- `references/rules/_template.md`
- `references/rules/arch-avoid-circular-deps.md`
- `references/rules/arch-feature-modules.md`
- `references/rules/arch-module-sharing.md`
- `references/rules/arch-single-responsibility.md`
- `references/rules/arch-use-repository-pattern.md`
- `references/rules/arch-use-events.md`
- `references/rules/di-avoid-service-locator.md`
- `references/rules/di-prefer-constructor-injection.md`
- `references/rules/di-scope-awareness.md`
- `references/rules/di-use-interfaces-tokens.md`
- `references/rules/error-handle-async-errors.md`
- `references/rules/error-throw-http-exceptions.md`
- `references/rules/error-use-exception-filters.md`
- `references/rules/security-auth-jwt.md`
- `references/rules/security-rate-limiting.md`
- `references/rules/security-sanitize-output.md`
- `references/rules/security-use-guards.md`
- `references/rules/security-validate-all-input.md`
- `references/rules/perf-async-hooks.md`
- `references/rules/perf-lazy-loading.md`
- `references/rules/perf-optimize-database.md`
- `references/rules/perf-use-caching.md`
- `references/rules/test-e2e-supertest.md`
- `references/rules/test-mock-external-services.md`
- `references/rules/test-use-testing-module.md`
- `references/rules/db-avoid-n-plus-one.md`
- `references/rules/db-use-migrations.md`
- `references/rules/db-use-transactions.md`
- `references/rules/api-use-dto-serialization.md`
- `references/rules/api-use-interceptors.md`
- `references/rules/api-use-pipes.md`
- `references/rules/api-versioning.md`
- `references/rules/micro-use-health-checks.md`
- `references/rules/micro-use-patterns.md`
- `references/rules/micro-use-queues.md`
- `references/rules/devops-graceful-shutdown.md`
- `references/rules/devops-use-config-module.md`
- `references/rules/devops-use-logging.md`

---

## Full Compiled Document

If you keep a compiled version, place it at: `AGENTS.md` (optional). If present, it should be considered a convenience copy; the authoritative source is this index + individual rules.
```
