# .github/copilot-instructions.md

> Purpose: Provide **repo-wide** instructions for GitHub Copilot (Chat + Agent Mode) to build the **Core V1 MVP**: WhatsApp-first conversational commerce for PYMEs (Ropa, Belleza, Minimarket). Keep changes small, testable, and aligned to the MVP scope.

## 0) Product goal (MVP)
Build a **sales + support** chatbot that converts conversations into **orders**.

**Must have (V1):**
- WhatsApp inbound/outbound via webhook adapter
- Product search → cart → checkout (payment link / COD / transfer)
- Payment confirmation via webhook + fallback command `PAGADO`
- Post-sale: order status + simple tickets (missing/damaged/delay)
- Human handoff with structured summary
- Cart abandoned reminder (max 2, with limits)
- Minimal dashboard metrics (funnel)
- 3 playbooks: **Ropa**, **Belleza**, **Minimarket**

**Out of scope (V1):** CRM pipeline, advanced marketing automation, complex omnichannel, enterprise integrations.

## 1) Tech stack (current decisions)
- **Node.js + TypeScript**
- **NestJS** (HTTP + webhooks)
- **PostgreSQL** as source of truth
- Queue/Redis are optional for later; if needed, introduce incrementally.

## 2) Non-negotiable engineering rules

### 2.0 API Consumer-First Design (CRITICAL)
Every endpoint must be designed **from the consumer's perspective** (UI, cURL, third-party integrations).

**Mandatory questions before creating any endpoint:**
1. **How will UI consume this?** (drag & drop file? JSON form? redirect flow?)
2. **Can it be tested with cURL easily?** (without code transformation)
3. **Is the auth method consistent?** (Session Cookie vs API Key vs Webhook Signature)
4. **Are DTOs intuitive for external consumers?** (not shaped by internal implementation)

**Anti-patterns to avoid:**
- Requiring client to transform data before sending (e.g., file content → JSON string)
- Inconsistent auth methods across similar endpoints
- Endpoints that only work with internal knowledge of the codebase
- Missing or incorrect documentation in `BACKEND-EXECUTION-GUIDE.md`

**Required for every endpoint:**
- cURL example that works as-is (copy-paste ready)
- Clear error responses with actionable messages
- Consistent response structure across similar operations
- Documentation updated BEFORE PR is merged

### 2.1 Webhook safety & idempotency
- **Never process the same inbound message twice.**
- Store and dedupe by provider `message_id`.
- All external callbacks (payment webhooks) must be **idempotent** using `payment_intent_id` (or equivalent).

### 2.2 State is persisted (no “memory-only” logic)
- Conversation, cart, order, payment, tickets must be stored in Postgres.
- The bot must be able to recover after restarts with no loss of correctness.

### 2.3 LLM guardrails
- LLM is used for: intent classification, natural language responses, clarification questions, and handoff summaries.
- LLM must **NOT** invent: price, stock, delivery times, policies.
- Any transactional confirmation (price/stock/order) must come from backend tools/services.

### 2.4 Minimal PII
- Store only what is required: phone, name (optional), delivery address.
- Avoid logging raw PII in application logs.

## 3) Repository structure (recommended)
/apps/api
/src
/channels # WhatsApp adapter + message normalization
/orchestrator # intent + flow engine
/domain # entities: cart, order, ticket
/services # catalog, payments, orders
/persistence # repositories (TypeORM/Prisma) + migrations
/analytics # events + metrics
/docs
mvp-core-v1.md

## 4) Workflow expectations for Copilot Agent
When implementing a change:
1. **Plan first** (brief): what files will change, data model changes, risks.
2. Implement in small increments.
3. Add/adjust tests (unit/integration) for critical paths.
4. Update docs and `.env.example` if new config is introduced.

## 5) Definition of Done (DoD)
A PR is done when:
- Webhook idempotency is implemented and tested.
- Cart → checkout → payment confirmation works end-to-end.
- Post-sale status query works.
- Handoff summary includes: intent, cart snapshot, step, key user info.
- Lint + tests pass.
- **API endpoints have working cURL examples in `BACKEND-EXECUTION-GUIDE.md`.**
- **Endpoints are testable without UI** (consumer can use cURL/Postman).
- **Auth method is documented and consistent** with similar endpoints.

## 6) Commands
Provide scripts in package.json and use them consistently:
- `pnpm dev` or `npm run dev`
- `pnpm test` or `npm test`
- `pnpm lint` or `npm run lint`

## 7) Output style
- Prefer concrete diffs and code-level changes.
- Use clear names and typed DTOs.
- Favor maintainability and correctness over cleverness.
