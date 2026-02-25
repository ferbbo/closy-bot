# AGENTS.md

> Guardrails globales para todos los agentes Copilot.
> Metodologia: **Spec-Driven Development (SDD)** — el brief.md es la fuente de verdad.
>
> Detalle completo del flujo: `docs/plan/SDD-FLOW.md`
> Roles: `.github/agents/*.agent.md`
> Spec de producto: `docs/mvp-core-v1.md`

## 1. Principio SDD

**La spec (brief.md) es la fuente de verdad. Todo se verifica contra ella.**

- No se codea sin brief APPROVED (BRIEF GATE).
- No se mergea sin evidencia completa por AC (VERIFICATION GATE).
- Si falta info, se abre Spec Change Request y se PARA.

## 2. Product scope (MVP V1)

- **WhatsApp-first** conversational commerce para PYMEs.
- V1: catalog -> cart -> checkout -> payment -> order status -> handoff.
- **Out of scope:** CRM pipelines, advanced marketing, enterprise integrations.

## 3. Non-negotiable rules

### 3.0 API Consumer-First (CRITICAL)

**La API debe ser usable desde afuera sin conocimiento interno del código.**

Principios:
- **UI-ready**: endpoints diseñados para consumo desde frontend (drag & drop, forms, redirects)
- **cURL-testable**: cada endpoint testeable con cURL copy-paste (sin transformaciones)
- **Auth consistente**: Session Cookie (dashboard), API Key (catalog), Webhook Signature (Meta)
- **DTOs externos**: estructura pensada para el consumidor, no para la implementación interna
- **Documentación primero**: `BACKEND-EXECUTION-GUIDE.md` actualizado ANTES de mergear

**Checklist obligatorio para endpoints:**
- [ ] ¿UI puede consumirlo directamente? (ej: file upload con multipart, no JSON con contenido)
- [ ] ¿cURL example funciona copy-paste?
- [ ] ¿Auth method es consistente con endpoints similares?
- [ ] ¿Errores son accionables para el consumidor?
- [ ] ¿Documentación actualizada en BACKEND-EXECUTION-GUIDE.md?

### 3.1 Transactional correctness

- Todo estado de negocio **persistido en PostgreSQL**.
- Webhooks **idempotentes**:
  - inbound: dedupe por `message_id` (unique)
  - payments: por `payment_intent_id` (unique)

### 3.2 LLM guardrails

- LLM para: intent, lenguaje natural, clarificaciones, resumenes.
- LLM **NO inventa**: stock, precios, politicas, tiempos de entrega.
- Confirmaciones transaccionales desde backend services/tools.

### 3.3 Safety and privacy

- Minimizar PII almacenado y loggeado.
- Secrets nunca commiteados; actualizar `.env.example` para nueva config.

### 3.4 Engineering hygiene

- Diffs pequenos, incrementales.
- Tests para paths criticos (idempotencia, transiciones de estado).

## 4. Roles (SDD)

| Rol | Responsabilidad | NO puede |
|-----|----------------|----------|
| **Architect** | Tech design + PR-STACK entries | Codear, crear issues, aprobar PRs |
| **Planner** | Brief (DRAFT), issues (post-gate), branch, SCR updates | Codear, crear branch pre-BRIEF GATE |
| **Builder** | Implementar spec-locked, evidencia por AC, SCR si gap | Agregar scope, modificar spec, mergear |
| **Reviewer** | Validar contra brief AC/DoD, emitir verdict | Implementar fixes, editar archivos |

## 5. Gates

| Gate | Condicion | Quien aprueba |
|------|-----------|---------------|
| **BRIEF GATE** | brief.md completo con REQs + ACs | Humano |
| **VERIFICATION GATE** | Todos AC con evidencia + DoD completo | Humano |

## 6. How to work in this repo

1. Check **PR-STACK**: `docs/plan/PR-STACK-core-v1.md`
2. Check/create **brief.md**: `docs/plan/pr-briefs/PR-XX-<slug>.md`
3. Follow **SDD flow**: `docs/plan/SDD-FLOW.md`
4. If gap detected: open **Spec Change Request** before continuing

## 7. Trazabilidad

```
brief.md (REQ-01..N) -> Issue (#NN) -> PR AC checklist -> Evidencia (test)
```

- 1 issue por PR con TODOS los REQs del brief
- Cada AC del brief = 1 checkbox en el PR
- Cada AC = evidencia documentada (test name, log, screenshot)
- PR description SIEMPRE linkea al brief.md

## 8. References

- SDD Flow: `docs/plan/SDD-FLOW.md`
- Product spec: `docs/mvp-core-v1.md`
- Repo instructions: `.github/copilot-instructions.md`
- Role agents: `.github/agents/*.agent.md`
- Brief template: `docs/plan/PR-BRIEF-template.md`
- PR Stack: `docs/plan/PR-STACK-core-v1.md`
