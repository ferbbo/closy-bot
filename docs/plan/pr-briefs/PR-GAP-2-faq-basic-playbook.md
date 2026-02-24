# Brief — PR-GAP-2 — FAQ básico: PlaybookConfig + FaqFlow

> **Status**: `DRAFT`
> **Archivo**: `docs/plan/pr-briefs/PR-GAP-2-faq-basic-playbook.md`
> **Issue**: [TBD](link) (1 issue con todos los REQs)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Habilitar respuestas automáticas a preguntas frecuentes (envío, devoluciones, garantía, pagos) sin RAG/embeddings, usando keyword matching sobre array de FAQs en PlaybookConfig. Reduce handoffs por preguntas repetitivas y mejora experiencia conversacional sin costo LLM.

## Scope fence

### ✅ Included

- Extensión de `PlaybookConfig` interface con campo `faqs: Faq[]`
- Tipo `Faq` con `question`, `keywords`, `answer`
- Intent `QUERY_FAQ` keywords en `INTENT_KEYWORDS` (keyword-configs.ts)
- `FaqFlow` con scoring por keyword matches + threshold
- Industry presets con 5+ FAQs base cada uno (ropa, belleza, minimarket, generic)
- Integración en `ConversationOrchestrator` (router resolves a FAQ flow)
- Tests unit (scoring, match/no-match) + e2e (end-to-end FAQ resolution)
- Update `.env.example` con `FAQ_MATCH_THRESHOLD` (default: 1)
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL PATCH para FAQs

### ❌ Excluded

- RAG/embeddings/búsqueda semántica
- Editor visual de FAQs en UI
- Endpoint específico para CRUD FAQs (usa `PATCH /merchants/me/playbook` existente)
- Categorización de FAQs
- Historial de FAQs consultadas
- FAQ analytics (count, popular FAQs)
- Fuzzy matching (pg_trgm, levenshtein)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Extender `PlaybookConfig` interface con `faqs` array | [#TBD](link) | AC-01 |
| REQ-02 | Agregar keywords para intent `QUERY_FAQ` en `INTENT_KEYWORDS` | [#TBD](link) | AC-02 |
| REQ-03 | Crear `FaqFlow` con keyword scoring y threshold | [#TBD](link) | AC-03 |
| REQ-04 | Actualizar industry presets con 5+ FAQs base | [#TBD](link) | AC-04 |
| REQ-05 | Integrar FaqFlow en `ConversationOrchestrator` | [#TBD](link) | AC-05 |
| REQ-06 | Merchant puede actualizar FAQs via `PATCH /merchants/me/playbook` | [#TBD](link) | AC-06 |
| REQ-07 | Tests unit + e2e con casos positivos y negativos | [#TBD](link) | AC-07 |

> **Nota**: Todos los REQs apuntan al mismo issue (#TBD).

## Paths a tocar (concretos)

- `apps/api/src/domain/entities/playbook-config.interface.ts` (extend con `faqs`)
- `apps/api/src/orchestrator/intent/keyword-configs.ts` (add QUERY_FAQ keywords)
- `apps/api/src/orchestrator/flows/faq.flow.ts` (nuevo)
- `apps/api/src/orchestrator/flows/faq.flow.spec.ts` (nuevo)
- `apps/api/src/orchestrator/conversation.orchestrator.ts` (add case QUERY_FAQ)
- `apps/api/src/domain/entities/playbook-defaults/ropa.config.ts` (add faqs)
- `apps/api/src/domain/entities/playbook-defaults/belleza.config.ts` (add faqs)
- `apps/api/src/domain/entities/playbook-defaults/minimarket.config.ts` (add faqs)
- `apps/api/src/domain/entities/playbook-defaults/generic.config.ts` (add faqs)
- `.env.example` (add `FAQ_MATCH_THRESHOLD`)
- `docs/BACKEND-EXECUTION-GUIDE.md` (add cURL ejemplo para PATCH faqs)
- `test/e2e/faq-flow.e2e-spec.ts` (nuevo)

## Contratos / Interfaces

### A) Tipo Faq (nuevo en playbook-config.interface.ts)

| Field | Type | Required | Descripción |
|-------|------|----------|-------------|
| question | string | Sí | Pregunta ejemplo (para referencia humana) |
| keywords | string[] | Sí | Keywords de matching (normalizado: lowercase, sin tildes) |
| answer | string | Sí | Respuesta del bot (puede tener emojis, saltos de línea) |

### B) PlaybookConfig.faqs

| Field | Type | Required | Default | Descripción |
|-------|------|----------|---------|-------------|
| faqs | Faq[] | No | [] | Array de FAQs por merchant/industry |

### C) INTENT_KEYWORDS extension

- Intent: `QUERY_FAQ`
- Keywords (peso 3-5):
  - `envio, envío, demora, llega, días, cuanto demora` (peso 4)
  - `devolver, devolución, cambio, garantía` (peso 4)
  - `pago, transferencia, efectivo, como pago, metodo de pago, metodos` (peso 3)
  - `horario, abierto, cuando atienden` (peso 3)
  - `donde, direccion, ubicacion` (peso 2)

### D) FaqFlow interface

```typescript
handle(merchantId: string, query: string, playbookConfig: PlaybookConfig): Promise<string | null>
```

- Retorna: FAQ answer si match score >= threshold, `null` si no match
- Scoring: cuenta cuántos keywords del FAQ matchean en el query normalizado

### E) Endpoint (existente, solo documentar)

- `PATCH /merchants/me/playbook`
- Auth: Session cookie (SessionAuthGuard)
- Body DTO: `{ faqs?: Faq[] }` (actualiza solo campo faqs)
- Response: 200 OK con `{ success: true, playbookConfig }`

## Comportamiento

### Happy path:
1. Cliente envía: `"¿Cuánto demora el envío?"`
2. IntentRouter clasifica → `QUERY_FAQ` (HIGH confidence)
3. Orchestrator → FaqFlow.handle()
4. FaqFlow normaliza query: `"cuanto demora el envio"`
5. Busca en `playbookConfig.faqs`, encuentra match con keywords `["envío", "demora", "llega"]`
6. Score = 2 (dos keywords matchean), threshold = 1 → match positivo
7. Bot responde con `faq.answer`: `"Los envíos demoran 3-5 días hábiles 📦"`

### Edge cases:
- **No match con threshold**: pregunta `"¿Venden medias?"` → keywords no matchean FAQs → FaqFlow retorna `null` → Orchestrator fallback a UNKNOWN (search o respuesta genérica)
- **Múltiples FAQs con keywords similares**: elige el FAQ con mayor score
- **Score empate**: elige el primero del array (order matters)
- **FAQs array vacío**: FaqFlow retorna `null` inmediatamente
- **Query muy corta (`"envio"`**: puede matchear si keyword existe, pero IntentRouter puede clasificar como SEARCH_PRODUCT por ambigüedad → depende de intent scoring primero
- **Normalización crítica**: `"Envío"` debe matchear FAQ con keyword `"envio"` (sin tilde)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | PlaybookConfig tiene campo `faqs: Faq[]` con tipo correcto | test: `playbook-config.interface.spec.ts` valida type + estructura |
| AC-02 | Intent QUERY_FAQ tiene 10+ keywords con weights | test: `keyword-configs.spec.ts` valida keywords array |
| AC-03 | FaqFlow.handle() retorna answer si score >= threshold, null si no match | test: `faq.flow.spec.ts` casos: match, no-match, threshold boundary |
| AC-04 | 4 industry presets tienen 5+ FAQs cada uno | test: validación en `playbook.service.spec.ts` + inspección manual |
| AC-05 | Orchestrator route QUERY_FAQ → FaqFlow → responde con FAQ answer | test e2e: `faq-flow.e2e-spec.ts` simula webhook con pregunta FAQ |
| AC-06 | `PATCH /merchants/me/playbook` con `{ faqs: [...] }` actualiza campo | test e2e: `merchant-settings.e2e-spec.ts` (ya existe) extendido |
| AC-07 | Cliente pregunta FAQ configurada → recibe respuesta correcta sin handoff | test e2e: end-to-end con merchant custom FAQ |
| AC-08 | Cliente pregunta no cubierta → fallback a UNKNOWN/SEARCH (no crash) | test e2e: query `"¿Venden bicicletas?"` → respuesta genérica/search |
| AC-09 | Normalización funciona: `"Envío"` matchea FAQ con keyword `"envio"` | test unit: `faq.flow.spec.ts` caso con tildes/mayúsculas |

## Plan de pruebas

### Unit:
- `playbook-config.interface.spec.ts`: validar tipo Faq
- `keyword-configs.spec.ts`: validar QUERY_FAQ keywords array
- `faq.flow.spec.ts`:
  - Caso: FAQ match con score >= threshold → retorna answer
  - Caso: FAQ match con score < threshold → retorna null
  - Caso: múltiples FAQs con keywords → elige mayor score
  - Caso: empate score → elige primero del array
  - Caso: normalización tildes/mayúsculas
  - Caso: faqs array vacío → retorna null
- `playbook.service.spec.ts`: validar que industry presets tienen faqs

### Integration:
- `faq-flow.e2e-spec.ts`:
  - Simula webhook inbound con pregunta FAQ
  - Verifica outbound contiene FAQ answer
  - Verifica que no hubo llamada LLM
- `merchant-settings.e2e-spec.ts` (extender existente):
  - PATCH /merchants/me/playbook con faqs array
  - Verifica que persiste correctamente

### Manual (opcional):
- Conectar WhatsApp test number
- Enviar pregunta: `"¿Cuánto demora el envío?"`
- Verificar respuesta es del FAQ preset

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (PlaybookConfig JSON field en Merchant)
- [ ] Idempotencia: N/A (no aplica, es query read-only)
- [ ] Guardrails: bot responde con FAQ config, NO inventa políticas
- [ ] PII: N/A (FAQs son data operativa, no PII)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migrations N/A (usa JSON field existente en Merchant.playbookConfig)
- [ ] `.env.example` actualizado con `FAQ_MATCH_THRESHOLD`
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con cURL ejemplo para PATCH FAQs
- [ ] 4 industry presets tienen 5+ FAQs base cada uno
- [ ] FaqFlow integrado en Orchestrator con case QUERY_FAQ
- [ ] Normalización (lowercase + sin tildes) implementada y testeada

## Constraints

- **Sin LLM**: FAQ matching es 100% keyword-based, sin embeddings/GPT
- **Simple scoring**: cuenta matches, no fuzzy/levenshtein/edit distance
- **Order matters**: en caso de empate score, elige primer FAQ del array
- **No analytics**: no se trackea qué FAQs son más consultadas (eso es V2/Bloque 6)
- **Guardrails**: bot responde solo con FAQs configuradas, NO inventa respuestas a preguntas no cubiertas

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Keywords muy genéricos causan false positives | Media | Medio | Threshold configurable + tests con casos ambiguos + doc recomienda keywords específicos |
| Intent QUERY_FAQ vs SEARCH_PRODUCT collision (`"tienes envío gratis"`) | Media | Bajo | IntentRouter V2 con scoring decide. Si SEARCH gana, FaqFlow no ejecuta (OK) |
| Merchant configura FAQs con keywords vacíos | Baja | Bajo | DTO validation con `@IsNotEmpty()` en keywords array |
| FAQ answer muy largo rompe formato WhatsApp | Baja | Bajo | No validamos largo por ahora. Doc recomienda < 300 chars |

## Consumer Experience

### Para el cliente final (WhatsApp):
- Pregunta común → respuesta instantánea sin espera
- Reduce frustración por "no entendí" en preguntas de políticas
- Sin cambio de UX (conversacional igual)

### Para el merchant (Dashboard):
- `PATCH /merchants/me/playbook` con cURL:
  ```bash
  curl -X PATCH http://localhost:3000/api/merchants/me/playbook \
    -H "Cookie: connect.sid=..." \
    -H "Content-Type: application/json" \
    -d '{
      "faqs": [
        {
          "question": "¿Cuánto demora el envío?",
          "keywords": ["envio", "demora", "llega", "dias"],
          "answer": "Los envíos demoran 3-5 días hábiles 📦"
        }
      ]
    }'
  ```
- Respuesta: `{ "success": true, "playbookConfig": {...} }`
- Auth: requiere session cookie válida (login via OIDC primero)

## Tech Notes

- **Normalización**: mismo approach que IntentRouter V2 (lowercase + strip tildes + trim + collapse spaces)
- **Scoring**: `score = faq.keywords.filter(kw => normalizedQuery.includes(kw)).length`
- **Threshold**: env var `FAQ_MATCH_THRESHOLD` (default: 1) → min keywords para considerar match
- **Fallback**: si FaqFlow retorna null, Orchestrator sigue flujo normal (UNKNOWN → search o respuesta genérica)
- **No persistencia extra**: FAQs se guardan en Merchant.playbookConfig (JSON field), no tabla separada
- **Pattern**: similar a PlaybookMessages — merchant override > industry defaults
- **Future-proof**: en V2 se puede agregar pg_trgm fuzzy matching o embeddings sin cambiar interface

## Industry Presets FAQs (ejemplos)

### Ropa:
1. **Envío**: keywords: `["envio", "demora", "llega"]`, answer: `"Los envíos demoran 3-5 días hábiles 📦"`
2. **Cambios**: keywords: `["cambio", "devolver", "talla"]`, answer: `"Aceptamos cambios hasta 15 días después 👗"`
3. **Tallas**: keywords: `["tallas", "disponible", "medidas"]`, answer: `"Contamos con tallas XS a XXL. ¿Qué talla buscas?"`
4. **Pago**: keywords: `["pago", "transferencia", "efectivo"]`, answer: `"Aceptamos transferencia y pago contra entrega 💳"`
5. **Stock**: keywords: `["stock", "reposicion", "cuando llega"]`, answer: `"Si no hay stock, te podemos notificar cuando llegue ✨"`

### Belleza:
1. **Envío**: keywords: `["envio", "demora"]`, answer: `"Envíos en 2-4 días hábiles. Gratis en compras >$50k 🚚"`
2. **Devolución**: keywords: `["devolver", "devolución", "no me gusto"]`, answer: `"Aceptamos devoluciones hasta 30 días sin abrir 💄"`
3. **Ingredientes**: keywords: `["ingredientes", "componentes", "alergia"]`, answer: `"Todos nuestros productos tienen ingredientes en la etiqueta. ¿Alguna alergia específica? 🌿"`
4. **Pago**: keywords: `["pago", "metodos", "transferencia"]`, answer: `"Aceptamos transferencia, link de pago y contra entrega 💳"`
5. **Muestras**: keywords: `["muestra", "prueba", "tamaño"]`, answer: `"Tenemos muestras de algunos productos. ¿Cuál te interesa? ✨"`

### Minimarket:
1. **Delivery**: keywords: `["delivery", "envio", "demora"]`, answer: `"Delivery en 2-4 horas en zona urbana 🛒"`
2. **Horarios**: keywords: `["horario", "abierto", "atienden"]`, answer: `"Atendemos de 8am a 10pm todos los días 🕐"`
3. **Mínimo**: keywords: `["minimo", "compra", "pedido"]`, answer: `"Pedido mínimo: $15.000 para delivery 💰"`
4. **Pago**: keywords: `["pago", "transferencia", "efectivo"]`, answer: `"Solo efectivo contra entrega 💵"`
5. **Devolución**: keywords: `["devolver", "cambio", "producto"]`, answer: `"No aceptamos devoluciones en alimentos. Solo productos defectuosos 🚫"`

### Generic (fallback):
1. **Envío**: keywords: `["envio", "demora"]`, answer: `"Los envíos demoran 3-5 días hábiles 📦"`
2. **Pago**: keywords: `["pago", "metodos"]`, answer: `"Aceptamos transferencia y pago contra entrega 💳"`
3. **Horarios**: keywords: `["horario", "abierto"]`, answer: `"Escribe 'ayuda' para ver nuestras opciones 💬"`
4. **Contacto**: keywords: `["contacto", "telefono", "whatsapp"]`, answer: `"Estoy aquí para ayudarte. ¿Qué necesitas? 😊"`
5. **Ayuda**: keywords: `["ayuda", "opciones"]`, answer: `"Escribe 'ayuda' para ver el menú completo 📋"`

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-24 | Brief inicial DRAFT | Planner generó spec completa |

---

**STOP: Esperando BRIEF GATE (aprobación humana) antes de crear issue/branch.**
