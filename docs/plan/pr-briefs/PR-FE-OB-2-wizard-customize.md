# Brief — PR-FE-OB-2 — Wizard: step-customize (pagos + políticas + FAQs)

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-OB-2-wizard-customize.md`
> **Issue**: [#104](https://github.com/ferbbo/closy-bot/issues/104) (1 issue con todos los REQs)
> **Parallel Mode**: `false` (default)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Reducir el wizard de onboarding de 5 pasos a 4 pasos efectivos, consolidando personalización de la tienda (pagos, políticas, FAQs) en un solo paso "Personaliza tu tienda" para cumplir la promesa MVP de "tienda lista en 10 minutos".

## Scope fence

### ✅ Included

- Eliminar `step-profile.tsx` (redundante: name/email vienen de OIDC, industria = "Retail General" fijo en MVP)
- Eliminar `step-payments.tsx` (será parte del nuevo step-customize)
- Crear `step-customize.tsx` con 3 secciones colapsables:
  1. **Métodos de pago** (contenido de ex-step-payments + URL de payment link)
  2. **Políticas de tu negocio** (shippingPolicy, returnPolicy, businessHours)
  3. **Preguntas frecuentes** (lista editable con 5 FAQs prellenadas "Retail General")
- Actualizar wizard `page.tsx` para 4 pasos: channel → catalog → customize → activate
- Backend: migration para agregar `businessHours` a `MerchantConfig`
- Backend: extender schema JSON de `paymentMethods` con `paymentLinkUrl` opcional
- Frontend: 5 FAQs prellenadas de preset "Retail General" al montar step-customize
- UI: accordion/tabs colapsables con indicador de completado por sección
- Guardar datos al salir del paso (onNext) o botones "Guardar" por sección
- Mobile-first responsive design

### ❌ Excluded

- Selector de industria (MVP usa "Retail General" fijo, B2 feature)
- Editor avanzado con preview bot (B2)
- Validación avanzada de URLs de payment link (solo formato URL)
- Keywords auto-generados con NLP (usa split simple por palabras)
- Categorización de FAQs o analytics
- Múltiples presets de industria en UI (B2)
- Drag & drop para reordenar FAQs
- Rich text editor para FAQs (textarea plain text OK)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear `step-customize.tsx` con 3 secciones colapsables (accordion) | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-01, AC-02 |
| REQ-02 | Sección "Métodos de pago": checkboxes + campos bancarios + URL payment link | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-03 |
| REQ-03 | Sección "Políticas": textareas para shipping/return policy + input businessHours | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-04 |
| REQ-04 | Sección "FAQs": lista editable (max 10) con 5 prellenadas "Retail General" | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-05, AC-06 |
| REQ-05 | Backend migration: agregar `businessHours` a `MerchantConfig` | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-07 |
| REQ-06 | Backend: extender `paymentMethods` JSON schema con `paymentLinkUrl` | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-08 |
| REQ-07 | Actualizar wizard `page.tsx` a 4 pasos (eliminar step-profile, step-payments) | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-09 |
| REQ-08 | Actualizar `ONBOARDING_STEPS` y stepper component para reflejar 4 pasos | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-10 |
| REQ-09 | Tests e2e: completar step-customize → todas secciones guardadas | [#104](https://github.com/ferbbo/closy-bot/issues/104) | AC-11 |

> **Nota**: Todos los REQs apuntan al mismo issue (#104).

## Paths a tocar (concretos)

### Frontend

```
apps/dashboard/src/
  app/
    onboarding/
      page.tsx                               # UPDATE: 4 steps, remover step-profile/payments
      _components/
        step-customize.tsx                   # NEW: consolidación pagos + políticas + FAQs
        step-profile.tsx                     # DELETE o deprecar
        step-payments.tsx                    # DELETE o deprecar
  components/
    ui/
      stepper.tsx                            # UPDATE: export ONBOARDING_STEPS con 4 items
      accordion.tsx                          # NEW (si no existe): shadcn accordion
  hooks/
    use-onboarding.ts                        # UPDATE: agregar hooks para policies + FAQs
  lib/
    api.ts                                   # UPDATE: agregar tipos para policies + FAQs
```

### Backend

```
prisma/
  schema.prisma                              # UPDATE: MerchantConfig + businessHours
  migrations/
    YYYYMMDDHHMMSS_add_business_hours/
      migration.sql                          # NEW

apps/api/src/
  merchant-settings/
    dto/
      merchant-config.dto.ts                 # UPDATE: agregar businessHours + paymentLinkUrl
      update-merchant-config.dto.ts          # UPDATE: agregar businessHours
      update-playbook-config.dto.ts          # (ya existe, solo documentar uso FAQs)
  domain/
    entities/
      playbook-config.interface.ts           # (ya tiene faqs desde PR-GAP-2)
      playbook-defaults/
        generic.config.ts                    # UPDATE: agregar faqs "Retail General" (5)

docs/
  BACKEND-EXECUTION-GUIDE.md                 # UPDATE: ejemplos step-customize endpoints
```

## Contratos / Interfaces

### Frontend Component Structure

#### step-customize.tsx (pseudo-structure descriptivo)

| Elemento | Descripción |
|----------|-------------|
| **Accordion Item 1** | "Métodos de pago" (expandido por default) |
| Checkboxes | ☐ Efectivo/Contraentrega, ☐ Transferencia/Nequi, ☐ Link de pago |
| Campos bancarios | Banco, Cuenta, Titular (solo si transferencia checked) |
| Campo URL payment link | Input URL (solo si payment link checked, validación URL) |
| Validación | Al menos 1 método requerido |
| **Accordion Item 2** | "Políticas de tu negocio" (colapsado inicial) |
| Shipping Policy | Textarea max 500 chars, required, default prellenado |
| Return Policy | Textarea max 500 chars, required, default prellenado |
| Business Hours | Input text max 200 chars, optional, placeholder ejemplo |
| **Accordion Item 3** | "Preguntas frecuentes" (colapsado inicial, badge "5 de 10") |
| FAQ List | Editable list component (max 10 items) |
| FAQ Item | Input question (max 100) + Textarea answer (max 300) + botón delete |
| Keywords | Auto-generados desde question (lowercase, split por palabras) |
| Botón Agregar | "➕ Agregar pregunta" (disabled si ≥10) |
| FAQs prellenadas | 5 FAQs "Retail General" al montar componente |
| **Footer** | Botón "← Anterior", botón "Guardar y Continuar" |

### Backend - Persistencia

#### MerchantConfig extension (Prisma)

| Campo | Tipo | Constraint | Descripción |
|-------|------|-----------|-------------|
| `businessHours` | String? | max 200 chars | "Lunes a Viernes 9am-6pm, Sábados 9am-1pm" |

#### PaymentMethods JSON schema extension (TypeScript type)

| Campo existente | Extension |
|----------------|-----------|
| `paymentMethods` JSON array | Agregar campo opcional `paymentLinkUrl?: string` en items tipo `payment_link` |

**Estructura actualizada (descriptivo):**

| Campo | Tipo | Opcional | Descripción |
|-------|------|----------|-------------|
| `type` | `'cod' \| 'transfer' \| 'payment_link'` | No | Tipo de método |
| `label` | `string` | No | Display name |
| `instructions` | `string` | Sí | Instrucciones para cliente |
| `bankInfo` | `BankInfo` | Sí | Solo si type = transfer |
| `paymentLinkUrl` | `string` | Sí | Solo si type = payment_link (URL completa) |

### Endpoints consumidos (existentes de PR-15)

#### PATCH /merchants/me/config

- **Auth**: Session Cookie (SessionAuthGuard)
- **Consumer Experience**:
  - UI: form submit con campos parciales (solo lo modificado)
  - cURL: testeable con JSON partial
- **Request body** (partial):

| Campo | Tipo | Validación |
|-------|------|-----------|
| `paymentMethods` | `PaymentMethodConfig[]` | Opcional, min 1 item si presente |
| `shippingConfig.shippingPolicy` | `string` | Opcional, max 500 chars |
| `returnPolicy` | `string` | Opcional, max 500 chars |
| `businessHours` | `string` | Opcional, max 200 chars |

- **Response**: 200 OK con `MerchantConfig` completo actualizado

#### PATCH /merchants/me/playbook

- **Auth**: Session Cookie (SessionAuthGuard)
- **Consumer Experience**:
  - UI: submit array de FAQs editadas
  - cURL: testeable con JSON
- **Request body** (partial):

| Campo | Tipo | Validación |
|-------|------|-----------|
| `faqs` | `Faq[]` | Opcional, max 10 items |
| `faqs[].question` | `string` | Required, max 100 chars |
| `faqs[].answer` | `string` | Required, max 300 chars |
| `faqs[].keywords` | `string[]` | Required, generados desde question |

- **Response**: 200 OK con `PlaybookConfig` completo actualizado

### FAQs preset "Retail General" (5 prellenadas)

| Question | Keywords | Answer |
|----------|----------|--------|
| ¿Cuánto demora el envío? | ["envio", "demora", "llega", "tiempo", "dias"] | Los envíos demoran 3-5 días hábiles después de confirmar tu pago 📦 |
| ¿Hacen envíos a mi ciudad? | ["envio", "ciudad", "departamento", "llegan", "envian"] | ¡Sí! Hacemos envíos a toda Colombia 🇨🇴 |
| ¿Puedo cambiar o devolver? | ["cambio", "devolucion", "devolver", "cambiar", "garantia"] | Tienes 8 días para cambios. El producto debe estar sin uso y con etiquetas 🏷️ |
| ¿Qué métodos de pago aceptan? | ["pago", "pagar", "nequi", "transferencia", "efectivo", "tarjeta"] | Aceptamos efectivo contra entrega, transferencia/Nequi y links de pago 💳 |
| ¿Tienen garantía? | ["garantia", "defecto", "danado", "roto"] | Todos nuestros productos tienen garantía de 30 días por defectos de fábrica ✅ |

### Defaults para políticas "Retail General"

| Campo | Default prellenado |
|-------|-------------------|
| `shippingPolicy` | "Envíos a toda Colombia. Tiempo: 3-5 días hábiles. Costo según ciudad." |
| `returnPolicy` | "Aceptamos cambios dentro de 8 días. Producto sin uso y con etiquetas." |
| `businessHours` | "" (vacío, opcional) |

## Comportamiento

### Happy path

1. Usuario llega a step 3 "Personaliza tu tienda" (tras completar channel + catalog)
2. **Sección 1 expandida**: ve checkboxes métodos de pago + defaults prechecked (cod + transfer del preset)
3. Usuario check "Link de pago" → aparece input URL → ingresa `https://link.mercadopago.com.co/merchant123`
4. **Sección 2**: expande accordion → ve políticas prellenadas desde preset "Retail General" → edita returnPolicy
5. **Sección 3**: expande accordion → ve badge "5 de 10" → ve lista con 5 FAQs prellenadas → agrega 1 nueva FAQ custom → total 6
6. Click "Guardar y Continuar":
   - Frontend llama `PATCH /merchants/me/config` con paymentMethods + policies + businessHours
   - Frontend llama `PATCH /merchants/me/playbook` con faqs array (6 items)
7. Ambas requests success → marca step-customize completado → avanza a step-activate
8. Bot ahora responde correctamente a FAQs editadas y usa payment link URL en checkout

### Edge cases

#### Sección FAQs vacía al montar (no preset aplicado)

- **Caso**: Merchant avanzó sin aplicar preset de industria primero
- **Comportamiento**: step-customize monta con arrays vacíos
- **Solución**: Frontend siempre aplica defaults "Retail General" al montar si `faqs.length === 0`

#### Agregar FAQ #11 (excede máximo)

- **Input**: Usuario intenta agregar 11va FAQ
- **Output**: Botón "➕ Agregar" está disabled cuando `faqs.length >= 10`

#### Guardar con 0 métodos de pago checked

- **Input**: Usuario uncheck todos los métodos
- **Output**: Validación frontend previene submit, muestra error "Debes seleccionar al menos un método de pago"

#### Keywords generación para FAQ con tildes

- **Input**: Question = "¿Cuánto cuesta el envío?"
- **Keywords esperados**: `["cuanto", "cuesta", "el", "envio"]` (normalize lowercase + sin tildes)
- **Implementación**: Frontend aplica normalización antes de guardar

#### Políticas con líneas nuevas (multiline)

- **Input**: User escribe policy con saltos de línea en textarea
- **Output**: Backend persiste string con `\n`, bot responde con saltos (WhatsApp soporta)

#### Payment link URL inválida

- **Input**: Usuario ingresa `"not-a-url"`
- **Output**: Validación Zod muestra error inline "URL inválida" (usar `.url()` validator)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | step-customize renderiza con 3 secciones accordion (pagos, políticas, FAQs) | Screenshot: accordion visible con 3 items |
| AC-02 | Sección 1 expandida por default, secciones 2 y 3 colapsadas inicial | Screenshot: solo Métodos de pago visible al montar |
| AC-03 | Checkboxes métodos de pago funcionales + campos condicionales (banking, URL link) | Test e2e: check payment_link → input URL visible y validado |
| AC-04 | Políticas prellenadas con defaults "Retail General" al montar componente | Test: verify `shippingPolicy` tiene texto default inicial |
| AC-05 | FAQs lista editable con 5 items prellenados al montar si array vacío | Test: componente monta → verify `faqs.length === 5` |
| AC-06 | Agregar/eliminar FAQs funcional, máx 10 items, botón agregar disabled si ≥10 | Test e2e: agregar hasta 10 → botón disabled + delete funcional |
| AC-07 | Migration agrega campo `businessHours` a `MerchantConfig` | Inspección: `prisma migrate status` muestra migración aplicada |
| AC-08 | DTOs backend aceptan `businessHours` y `paymentLinkUrl` | Test unit: DTO validation pasa con nuevos campos |
| AC-09 | Wizard page.tsx tiene 4 pasos (sin step-profile, sin step-payments) | Test e2e: navegar wizard → verify max step = 4 |
| AC-10 | Stepper component muestra 4 steps con labels correctos | Screenshot: stepper con "Canal, Catálogo, Personalización, Activar" |
| AC-11 | Guardar step-customize persiste pagos + políticas + FAQs correctamente | Test e2e: submit → verify PATCH calls success → verify data en DB |
| AC-12 | Bot responde correctamente a FAQ editada después de wizard | Test e2e: editar FAQ #1 → enviar pregunta match keyword → bot responde con answer custom |
| AC-13 | Payment link URL aparece en mensaje checkout si método configurado | Test e2e: checkout con payment_link → mensaje contiene URL configurada |

## Plan de pruebas

### Unit (componentes)

- `step-customize.tsx`:
  - Accordion items renderizan correctamente (3 secciones)
  - Validación mínimo 1 método de pago checked
  - Campos condicionales (banking, URL) aparecen según checkboxes
  - FAQ max 10 items, botón agregar disabled correctamente
  - Keywords normalization (lowercase, sin tildes)

### Integration (hooks)

- `use-onboarding.ts`:
  - `useSavePaymentConfig` llama `PATCH /merchants/me/config` con body correcto
  - `useSavePolicies` (nuevo hook) llama PATCH con policies + businessHours
  - `useSaveFaqs` (nuevo hook) llama `PATCH /merchants/me/playbook` con faqs array

### E2E (Playwright o manual)

**Scenario 1: Wizard 4 pasos completo con step-customize**
```gherkin
Given merchant completo steps channel y catalog
When navega a step 3 "Personalización"
Then ve accordion con 3 secciones
When expande "Métodos de pago" y check "Link de pago"
And ingresa URL "https://pay.me/merchant"
And expande "Políticas" y edita returnPolicy
And expande "FAQs" y agrega 1 nueva FAQ
And click "Guardar y Continuar"
Then request PATCH /merchants/me/config success
And request PATCH /merchants/me/playbook success
And step-customize marcado completado en progress
And avanza a step-activate
```

**Scenario 2: FAQs prellenadas desde preset**
```gherkin
Given merchant SIN preset aplicado (faqs array vacío)
When monta step-customize
Then frontend aplica defaults "Retail General"
And ve 5 FAQs prellenadas
And puede editarlas o agregar más
```

**Scenario 3: Validación payment link URL**
```gherkin
Given usuario en step-customize sección "Métodos de pago"
When check "Link de pago"
And ingresa "not-a-url" en campo URL
And intenta guardar
Then ve error "URL inválida" inline
And submit bloqueado hasta corregir
```

## DoD

- [ ] Todos los AC tienen evidencia (test name / log / screenshot)
- [ ] step-customize funcional con 3 secciones colapsables
- [ ] Wizard reducido a 4 pasos (step-profile y step-payments eliminados)
- [ ] Migration `businessHours` aplicada y testeada
- [ ] DTOs backend aceptan `businessHours` y `paymentLinkUrl`
- [ ] Frontend aplica defaults "Retail General" si preset no aplicado
- [ ] FAQs editables, max 10, con keywords auto-generados
- [ ] Bot responde correctamente a FAQs post-wizard
- [ ] Payment link URL aparece en mensajes checkout si configurado
- [ ] Sin scope creep (solo lo del brief)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] `npx tsc --noEmit` retorna 0 errores (backend + frontend)
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con cURL examples
- [ ] Responsive mobile-first design
- [ ] Tests e2e pasan (wizard completo 4 pasos)

## Constraints

- **Guardrails**: el bot NO inventa políticas, precios, tiempos de envío (lee desde MerchantConfig)
- **PII**: no logguear contenido de políticas o FAQs (pueden tener info sensible)
- **MVP Scope**: "Retail General" único preset visible (sin selector industria en UI)
- **Consumer-First**: endpoints testeables con cURL, UI consume APIs existentes (PR-15)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Keywords auto-generados no matchean en bot | Media | Alto | Normalización consistente frontend/backend (lowercase, sin tildes, split por espacios) |
| Políticas demasiado largas rompen UI WhatsApp | Baja | Medio | Validación max 500 chars por campo, UI muestra contador caracteres |
| Preset "Retail General" no cubre casos reales | Media | Bajo | 5 FAQs generales cubren top preguntas, merchant puede editar post-wizard |
| Migration `businessHours` falla en producción | Baja | Alto | Migration simple (add column nullable), rollback plan documentado |
| Múltiples requests (config + playbook) fallan parcialmente | Media | Medio | UI maneja errores individuales, permite retry por sección fallida |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |

