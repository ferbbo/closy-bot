# Spec-Driven Development (SDD) — Flujo Operativo

> Fuente de verdad para el flujo de desarrollo del Core V1 MVP.
> El brief.md es la spec; todo se verifica contra ella.

---

## 1. Flujo SDD (10 pasos, 2 gates)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Feature Request                                             │
│  2. Architect → Tech Design + PR-STACK entry                    │
│  3. Planner → brief.md (DRAFT)                                  │
│  ══════════════════════════════════════════════════════════════  │
│  4. 🚧 BRIEF GATE — Human aprueba brief.md                     │
│  ══════════════════════════════════════════════════════════════  │
│  5. Planner → Issue + Branch (post-aprobación)                  │
│  6. Builder → Implementación (spec-locked)                      │
│  7. ↺ Spec Change Request (si falta info → volver a 3-4)       │
│  8. Reviewer → Validación contra brief + AC + DoD               │
│  9. Builder ↔ Reviewer iteración hasta LGTM                    │
│  ══════════════════════════════════════════════════════════════  │
│  10. 🚧 VERIFICATION GATE — Merge solo con evidencia completa  │
│  ══════════════════════════════════════════════════════════════  │
└─────────────────────────────────────────────────────────────────┘
```

### Paso 1 — Feature Request
- **Quién**: Humano
- **Input**: Necesidad de producto / bug / mejora
- **Output**: Descripción informal del cambio
- **Gate**: Ninguno

### Paso 2 — Architect: Tech Design + PR-STACK
- **Quién**: Architect
- **Input**: Feature request, `docs/mvp-core-v1.md`, `PR-STACK-core-v1.md`
- **Output**: Entrada actualizada en PR-STACK con dependencias, tech notes, breakdown
- **Gate**: PR-STACK entry definida
- **Regla**: No inventa APIs/tablas fuera de la spec de producto

### Paso 3 — Planner: brief.md (DRAFT)
- **Quién**: Planner
- **Input**: PR-STACK entry, estado del código actual
- **Output**: `docs/plan/pr-briefs/PR-XX-<slug>.md` en status `DRAFT`
- **Gate**: Brief existe con todos los campos obligatorios llenos
- **Regla**: Requisitos numerados (REQ-01..N), AC verificables, scope fence explícito

### Paso 4 — 🚧 BRIEF GATE (aprobación humana)
- **Quién**: Humano
- **Input**: brief.md en DRAFT
- **Output**: brief.md con status `APPROVED` (o comentarios de revisión)
- **Regla dura**: **NO se crea rama, NO se crean issues, NO se escribe código** hasta que el humano marque `Status: APPROVED`
- **Acción**: Humano revisa brief, ajusta si necesario, cambia status a APPROVED

### Paso 5 — Planner: Issue + Branch
- **Quién**: Planner
- **Input**: brief.md APPROVED
- **Output**: 1 issue en GitHub con TODOS los REQs, branch `PR-XX-<slug>`, brief sincronizado con issue
- **Gate**: Branch existe, issue creado con todos los REQs/ACs
- **Regla**: El issue contiene todos los REQ-IDs y AC-IDs del brief

### Paso 6 — Builder: Implementación (spec-locked)
- **Quién**: Builder
- **Input**: brief.md APPROVED, issues, branch
- **Output**: Código, tests, migraciones, evidencia por AC
- **Gate**: `pnpm lint` y `pnpm test` pasan
- **Regla**: Implementa SOLO lo definido en brief. Si falta algo → Paso 7

### Paso 7 — Spec Change Request (si necesario)
- **Quién**: Builder (detecta) → Planner (actualiza) → Humano (re-aprueba)
- **Input**: Gap detectado por Builder (requisito faltante, ambigüedad, conflicto)
- **Output**: brief.md actualizado con status `AMENDED`, Spec Change Log actualizado
- **Gate**: Humano re-aprueba brief antes de que Builder continúe
- **Regla**: Builder **PARA de codear** hasta que la spec se actualice y re-apruebe
- **Proceso**:
  1. Builder abre issue `spec-change-request` describiendo el gap
  2. Planner actualiza brief.md (agrega/modifica REQ/AC)
  3. Planner registra cambio en la sección "Spec Change Log" del brief
  4. Humano revisa y re-aprueba
  5. Builder retoma implementación

### Paso 8 — Reviewer: Validación
- **Quién**: Reviewer
- **Input**: Diff del código, brief.md, checklist AC/DoD
- **Output**: Verdict (LGTM / Block + fix list accionable)
- **Gate**: Cada AC del brief tiene evidencia asociada
- **Regla**: NO implementa fixes, solo identifica y pasa al Builder

### Paso 9 — Builder ↔ Reviewer: Iteración
- **Quién**: Builder (fixes) → Reviewer (re-valida)
- **Input**: Fix list del Reviewer
- **Output**: Código corregido, re-validación
- **Gate**: Reviewer emite LGTM
- **Regla**: Sin límite fijo de iteraciones; continúa hasta LGTM

### Paso 10 — 🚧 VERIFICATION GATE (merge)
- **Quién**: Humano (merge final)
- **Input**: LGTM del Reviewer, PR con checklist completo
- **Output**: PR mergeado a main
- **Regla dura**: **NO se mergea si**:
  - Algún AC del brief no tiene evidencia (test/log/screenshot)
  - Algún item del DoD está sin marcar
  - El brief tiene status distinto a APPROVED/AMENDED
- **Acción**: Humano verifica checklist del PR, confirma evidencia, mergea

---

## 2. Roles y responsabilidades

### Architect

| Aspecto | Detalle |
|---------|---------|
| **Entradas** | Feature request, `mvp-core-v1.md`, `PR-STACK-core-v1.md`, estado del repo |
| **Salidas** | PR-STACK entry actualizada, tech notes, breakdown de PRs, handoff prompts |
| **Reglas duras** | NO codea. NO crea issues directamente. NO aprueba PRs. NO inventa APIs/tablas/eventos fuera de docs. |
| **Checklist** | ☐ Scope bounded a V1 ☐ Stack dependencies válidas ☐ Tech notes en PR-STACK entry ☐ Handoffs definidos |

### Planner

| Aspecto | Detalle |
|---------|---------|
| **Entradas** | PR-STACK entry, tech notes del Architect, codebase actual, issues existentes |
| **Salidas** | `brief.md` (DRAFT), 1 issue en GitHub con todos los REQs, branch, issue actualizado |
| **Reglas duras** | NO escribe código. NO modifica scope sin aprobación humana. NO crea branch/issue antes de BRIEF GATE. |
| **Checklist** | ☐ brief.md tiene todos los campos ☐ REQs numerados ☐ AC verificables con evidencia definida ☐ Scope fence explícito ☐ Issue contiene todos los REQs |

### Builder

| Aspecto | Detalle |
|---------|---------|
| **Entradas** | brief.md APPROVED, issues, branch, fix list del Reviewer |
| **Salidas** | Código, tests, migraciones, evidencia por AC, Spec Change Request (si necesario) |
| **Reglas duras** | NO agrega features fuera del brief. NO modifica spec. Si falta info → abre SCR y PARA. NO mergea. |
| **Checklist** | ☐ Solo implementa lo del brief ☐ Cada AC tiene evidencia ☐ lint+tests pasan ☐ No PII en logs ☐ .env.example actualizado |

### Reviewer

| Aspecto | Detalle |
|---------|---------|
| **Entradas** | Diff del código, brief.md, AC/DoD checklist |
| **Salidas** | Verdict (LGTM / Block) con fix list accionable |
| **Reglas duras** | NO implementa fixes. NO expande scope. NO edita archivos. Solo lee, analiza, y pasa al Builder. |
| **Checklist** | ☐ Cada AC verificado ☐ DoD cumplido ☐ Sin violaciones al brief ☐ Idempotencia OK ☐ Tests suficientes |

---

## 3. Estructura de artefactos

```
.github/
  pull_request_template.md              # Linkea brief.md + AC/DoD checklist
  ISSUE_TEMPLATE/
    pr-task.yml                         # Issue por requisito (mapea REQ-ID + AC-ID)
    spec-change-request.yml             # SCR: gap detectado por Builder
    config.yml
  agents/
    architect.agent.md
    planner.agent.md
    builder.agent.md
    reviewer.agent.md
    subagent-*.agent.md                 # Sin cambios
  instructions/
    typescript-5-es2022.instructions.md
  skills/
    nestjs-best-practices/SKILL.md
    prisma/SKILL.md

docs/
  mvp-core-v1.md                        # Spec de producto (fuente de verdad)
  plan/
    SDD-FLOW.md                         # ← Este archivo (flujo SDD)
    PR-STACK-core-v1.md                 # Roadmap de PRs con dependencias
    PR-BRIEF-template.md               # Plantilla de brief.md
    WORKFLOW-pr-stack.md                # Workflow operativo (resumen)
    pr-briefs/
      PR-XX-<slug>.md                   # 1 brief por PR (spec-locked)

AGENTS.md                               # Guardrails globales + referencia SDD
```

### Convenciones de nombres
- Brief: `docs/plan/pr-briefs/PR-XX-<slug>.md` (ej: `PR-04-carrito-crud.md`)
- Branch: `PR-XX-<slug>` (mismo slug que el brief)
- Issue: título `PR-XX: <descripción del PR>` (1 issue con todos los REQs)
- PR description: SIEMPRE linkea el brief.md

---

## 4. Prompts operativos por rol

### Prompt: Planner → genera/actualiza brief.md

```
@Planner

Genera el brief para PR-XX (<título>).

Contexto:
- PR-STACK entry: [pegar o referenciar la entrada del stack]
- Dependencias: [PR-YY, PR-ZZ]
- Feature: [descripción breve]

Instrucciones:
1. Lee el código actual relevante (paths del stack entry).
2. Si existe issue PR-XX, léelo primero para capturar contexto.
3. Genera `docs/plan/pr-briefs/PR-XX-<slug>.md` con status DRAFT.
4. Todos los requisitos deben ser numerados (REQ-01, REQ-02...).
5. Cada AC debe ser verificable (test, log, o paso manual).
6. Scope fence explícito: ✅ Included / ❌ Excluded.
7. Máximo 2 páginas.

Stop conditions (PARA si):
- No hay entrada en PR-STACK para este PR → pide al Architect primero.
- La feature requiere cambios en otro PR no mergeado → documenta dependencia y para.
- Hay ambigüedad en el requisito de producto → lista las preguntas y para.

Output: brief.md en DRAFT. NO crees branch ni issues aún (requiere BRIEF GATE).
```

### Prompt: Architect → diseño técnico mínimo + breakdown PR-STACK

```
@Architect

Diseña la solución técnica para: [descripción de la feature/requirement].

Contexto:
- Spec de producto: docs/mvp-core-v1.md
- Stack actual: docs/plan/PR-STACK-core-v1.md
- Constraints: [listar si hay]

Instrucciones:
1. Lee mvp-core-v1.md, PR-STACK, y el código actual relevante.
2. Propón la entrada(s) en PR-STACK con: título, dependencias, scope, tech notes.
3. Si la feature requiere múltiples PRs, define el orden y dependencias.
4. No inventes APIs/tablas/eventos fuera de lo documentado en mvp-core-v1.md.
5. Produce handoff prompts concretos para Planner.

Stop conditions (PARA si):
- La feature está fuera del scope V1 MVP → indica que es out-of-scope y para.
- Requiere decisiones de producto no documentadas → lista las preguntas y para.
- Hay conflicto con PRs ya mergeados → describe el conflicto y para.

Output: PR-STACK entry(s) actualizada(s) + handoff prompt para Planner.
```

### Prompt: Builder → implementa estrictamente lo definido

```
@Builder

Implementa PR-XX según el brief aprobado.

Contexto:
- Brief: docs/plan/pr-briefs/PR-XX-<slug>.md (status: APPROVED)
- Branch: PR-XX-<slug>
- Issue: #NN (contiene todos los REQs)

Instrucciones:
1. Lee el brief completo. Verifica que status = APPROVED.
2. Implementa SOLO los requisitos numerados (REQ-01..N) del brief.
3. Para cada AC, genera evidencia (test que lo demuestre).
4. Sigue el orden: entidades → servicios → controllers → tests.
5. Si algo no está definido en el brief o es ambiguo:
   a. NO lo implementes "como creas mejor".
   b. Abre un Spec Change Request (issue) describiendo el gap.
   c. PARA hasta que Planner actualice el brief y humano re-apruebe.
6. Al terminar, ejecuta handoff a Reviewer.

Stop conditions (PARA si):
- brief.md no tiene status APPROVED → no implementes nada.
- Un requisito del brief contradice el código existente → abre SCR y para.
- Necesitas agregar algo fuera del scope fence → abre SCR y para.
- Tests fallan por causa ajena a tu cambio → documenta y para.

Output: Código implementado + evidencia por AC + handoff a Reviewer.
```

### Prompt: Reviewer → valida contra brief + AC + DoD

```
@Reviewer

Revisa la implementación de PR-XX.

Contexto:
- Brief: docs/plan/pr-briefs/PR-XX-<slug>.md
- Branch: PR-XX-<slug>
- Iteración: [N]

Instrucciones:
1. Lee el brief completo (requisitos, AC, DoD, scope fence).
2. Lee el diff del código (search/changes).
3. Para cada AC del brief, verifica:
   a. ¿Está implementado? (sí/no)
   b. ¿Tiene evidencia? (test/log/screenshot)
   c. ¿Es correcto? (lógica, edge cases)
4. Verifica el DoD completo.
5. Verifica que NO hay scope creep (nada fuera del brief).
6. Emite verdict en formato compacto.
7. Si hay issues → handoff "Auto-Fix" al Builder.
8. Si LGTM → handoff "LGTM - Crear PR" al Builder.

Stop conditions (PARA si):
- No encuentras el brief → pide la ruta y para.
- El brief tiene status DRAFT → no revises, pide aprobación primero.
- El diff incluye cambios masivos fuera del brief → Block inmediato, pide SCR.

Output: Verdict con fix list accionable (NO implementes fixes).
```

---

## 5. Política de trazabilidad

### Regla: cada requisito es rastreable de spec a evidencia

```
brief.md (REQ-01..N) → GitHub Issue (#NN) → PR Checklist (AC-01..N) → Evidencia (test/log)
```

### Mapeo obligatorio

| Artefacto | Contiene | Referencia |
|-----------|----------|------------|
| **brief.md** | REQ-01..N + AC-01..N | Fuente de verdad |
| **GitHub Issue** | 1 issue por PR con TODOS los REQs (título: `PR-XX: <desc>`) | Linkea a brief.md |
| **PR description** | Checklist con cada AC + columna evidencia | Linkea a brief.md |
| **Código/Tests** | Test por AC + nombre descriptivo | Referencia AC-ID en describe/test name |

### Reglas de trazabilidad
1. **Cada PR tiene exactamente 1 issue** en GitHub con todos los REQs.
2. **Cada AC del brief aparece como checkbox** en el PR description.
3. **Cada AC debe tener evidencia** antes de merge: nombre del test, log, o screenshot.
4. **Si un REQ se agrega/modifica post-aprobación**, se registra en Spec Change Log del brief.
5. **El PR description incluye link al brief.md** — sin link = no merge.

### Verificación pre-merge (humano)
- [ ] Todos los AC del brief están marcados en el PR checklist
- [ ] Cada AC tiene evidencia documentada
- [ ] Issue contiene todos los REQs del brief
- [ ] Spec Change Log refleja todos los cambios post-aprobación (si hubo)

---

## 6. Rutina de ejecución para un PR

### Fase 1: Spec (antes de codear)

| Paso | Actor | Acción | Output |
|------|-------|--------|--------|
| 1 | Humano | Define feature/need | Descripción informal |
| 2 | Architect | Tech design + PR-STACK entry | Stack actualizado |
| 3 | Planner | Genera brief.md (DRAFT) | `pr-briefs/PR-XX-<slug>.md` |
| 4 | Humano | Revisa brief, ajusta, marca APPROVED | brief.md APPROVED |

### Fase 2: Setup (post-aprobación)

| Paso | Actor | Acción | Output |
|------|-------|--------|--------|
| 5 | Planner | Crea 1 issue con todos los REQs | Issue en GitHub |
| 6 | Planner | Crea branch `PR-XX-<slug>` | Branch remota + local |
| 7 | Planner | Sincroniza issue con brief | Issue actualizado |

### Fase 3: Build (spec-locked)

| Paso | Actor | Acción | Output |
|------|-------|--------|--------|
| 8 | Builder | Implementa REQs del brief | Código + tests |
| 9 | Builder | Si gap → abre SCR, PARA | SCR issue |
| 9b | Planner | Actualiza brief (si SCR) | brief.md AMENDED |
| 9c | Humano | Re-aprueba brief (si SCR) | brief.md re-APPROVED |
| 10 | Builder | `pnpm lint && pnpm test` | Todo verde |
| 11 | Builder | Handoff a Reviewer | — |

### Fase 4: Verify (validación)

| Paso | Actor | Acción | Output |
|------|-------|--------|--------|
| 12 | Reviewer | Valida diff vs brief AC/DoD | Verdict |
| 13 | Builder | Aplica fixes (si hay) | Código corregido |
| 14 | Reviewer | Re-valida → LGTM | LGTM |

### Fase 5: Ship (merge)

| Paso | Actor | Acción | Output |
|------|-------|--------|--------|
| 15 | Builder | Push + crea/actualiza PR | PR en GitHub |
| 16 | Humano | Verifica AC con evidencia, DoD completo | ✅ |
| 17 | Humano | Merge | PR mergeado |
| 18 | Planner | Actualiza PR-STACK (marca ✅) | Stack actualizado |

---

## 7. Spec Change Request (mini-proceso)

Cuando Builder detecta que el brief está incompleto/incorrecto:

1. **Builder** abre issue tipo `spec-change-request` con:
   - PR-XX afectado
   - REQ/AC que falta o es ambiguo
   - Propuesta de cambio (opcional)
2. **Builder** PARA de codear lo relacionado al gap.
3. **Planner** actualiza brief.md:
   - Agrega/modifica REQ/AC
   - Actualiza sección "Spec Change Log" con fecha, cambio, motivo
   - Cambia status a `AMENDED`
4. **Humano** revisa y re-aprueba.
5. **Builder** retoma implementación.

**Regla**: El SCR NO es para agregar features nuevas. Es para cerrar gaps en la spec existente.
