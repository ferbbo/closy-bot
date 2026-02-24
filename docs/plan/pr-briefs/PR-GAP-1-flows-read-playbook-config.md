# Brief — PR-GAP-1 — Flows leen PlaybookConfig.messages + botPersonality

> **Status**: `DRAFT`
> **Archivo**: `docs/plan/pr-briefs/PR-GAP-1-flows-read-playbook-config.md`
> **Issue**: TBD (post-BRIEF GATE)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Eliminar todos los mensajes hardcoded de flows (CartFlow, SearchCatalogFlow, HelpFlow, etc.) para que lean de `PlaybookConfig.messages` con placeholders simples. Agregar selector de alto nivel `botPersonality.style` para simplificar personalización por merchant sin editar 20+ campos.

## Scope fence

### ✅ Included

- Extensión de `PlaybookConfig` interface con:
  - `botPersonality { style, emojiUsage, signatureEmoji }`
  - `PlaybookMessages` con ~18 nuevos campos (ver tabla de contratos)
- Método `PlaybookService.getMessage(merchant, key, placeholders?)` con interpolación simple
- Refactor de 6 flows para usar `getMessage()` (CartFlow, AddToCartFlow, ViewCartFlow, RemoveFromCartFlow, UpdateCartItemFlow, SearchCatalogFlow, HelpFlow)
- Actualización de 4 industry presets (ropa, belleza, minimarket, generic) con todos los mensajes + botPersonality
- Tests unitarios verificando que flows usan PlaybookService (sin hardcode)
- GreetingFlow ya usa PlaybookService ✅ (solo verificar que siga funcionando)

### ❌ Excluded

- Handlebars / template engine formal (eso es Bloque 7 PR-22)
- Template DB / TemplatePack (Bloque 7 PR-20)
- Preview UI para merchants
- Variantes de mensajes (A/B testing)
- Notificaciones de actualización de copy
- Más allá de template literals simples (`{placeholder}`)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Extensión de `PlaybookConfig` con `botPersonality` y 18+ nuevos campos en `messages` | TBD | AC-01 |
| REQ-02 | Método `PlaybookService.getMessage(merchant, key, placeholders?)` con interpolación | TBD | AC-02 |
| REQ-03 | Refactor de CartFlow para usar `getMessage()` (eliminar 8+ strings hardcoded) | TBD | AC-03 |
| REQ-04 | Refactor de SearchCatalogFlow para usar `getMessage()` (eliminar 3 strings hardcoded) | TBD | AC-04 |
| REQ-05 | Refactor de HelpFlow para usar `getMessage()` (eliminar 1 string hardcoded) | TBD | AC-05 |
| REQ-06 | Actualización de 4 industry presets con todos los mensajes + `botPersonality` | TBD | AC-06 |
| REQ-07 | Tests unit verificando que flows NO tienen strings hardcoded | TBD | AC-07 |
| REQ-08 | `UpdatePlaybookConfigDto` acepta nuevos campos y valida correctamente | TBD | AC-08 |

> **Nota**: Todos los REQs apuntan al mismo issue (TBD post-BRIEF GATE).

## Paths a tocar (concretos)

- `apps/api/src/domain/entities/playbook-config.interface.ts` (interfaces)
- `apps/api/src/services/playbook.service.ts` (getMessage method)
- `apps/api/src/services/playbook.service.spec.ts` (tests para getMessage)
- `apps/api/src/orchestrator/flows/cart.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/add-to-cart.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/view-cart.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/remove-from-cart.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/update-cart-item.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/search-catalog.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/help.flow.ts` (refactor)
- `apps/api/src/orchestrator/flows/*.spec.ts` (tests)
- `apps/api/src/domain/entities/playbook-defaults/ropa.config.ts` (update)
- `apps/api/src/domain/entities/playbook-defaults/belleza.config.ts` (update)
- `apps/api/src/domain/entities/playbook-defaults/minimarket.config.ts` (update)
- `apps/api/src/domain/entities/playbook-defaults/generic.config.ts` (update)
- `apps/api/src/merchant-settings/dto/update-playbook-config.dto.ts` (validation)

## Contratos / Interfaces

### PlaybookConfig extension (REQ-01)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `botPersonality` | `BotPersonality` | Selector de alto nivel para tono/personalidad | `{ style: 'friendly', emojiUsage: 'moderate', signatureEmoji: '✨' }` |

### BotPersonality interface (nuevo)

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| `style` | `'friendly' \| 'professional' \| 'enthusiastic' \| 'minimal'` | Preset de tono | Controla emoji prefix/suffix, sinónimos |
| `emojiUsage` | `'none' \| 'moderate' \| 'frequent'` | Nivel de emojis (elevado desde LlmPromptConfig) | Aplicado en getMessage() |
| `signatureEmoji` | `string?` | Emoji de firma por industria | `'👗'` (ropa), `'✨'` (belleza), `'🛒'` (minimarket) |

### PlaybookMessages extension (REQ-01)

| Field | Type | Description | Placeholders | Ejemplo |
|-------|------|-------------|--------------|---------|
| **YA EXISTEN (PR-11):** |
| `greeting` | `string` | Saludo inicial | `{merchant_name}` | `"¡Hola! 👗 Soy tu asistente de {merchant_name}."` |
| `addToCartConfirm` | `string` | Confirmación agregar item | `{product_name}`, `{quantity}`, `{total}` | `"¡Genial! Agregado al carrito 🛒"` |
| `noStock` | `string` | Producto sin stock | `{product_name}` | `"Uy, ese modelo está agotado 😔"` |
| `upsellTemplate` | `string` | Sugerencia cross-sell | `{product}` | `"Este {product} combina perfecto con lo que elegiste ✨"` |
| `checkoutStart` | `string` | Inicio checkout | - | `"¡Perfecto! Vamos a confirmar tu pedido 📦"` |
| **NUEVOS (PR-GAP-1):** |
| `searchNoResults` | `string` | No se encontraron productos | `{query}` | `"😔 No encontré productos para \"{query}\""` |
| `searchResultsHeader` | `string` | Header de resultados | `{query}`, `{count}` | `"🔍 Resultados para \"{query}\" ({count}):"`|
| `searchResultsFooter` | `string` | Footer de resultados | - | `"💬 Para agregar, escribe el nombre del producto"` |
| `helpMenu` | `string` | Menú de ayuda | - | Ver ejemplo completo abajo |
| `cartEmpty` | `string` | Carrito vacío | - | `"🛒 *Tu carrito está vacío*\n\nEscribe \"buscar\" para explorar productos."` |
| `cartSummaryHeader` | `string` | Header resumen carrito | `{item_count}`, `{item_word}` | `"🛒 *Tu carrito* ({item_count} {item_word})"` |
| `cartSummaryFooter` | `string` | Footer resumen carrito | `{total}` | `"💰 *Total: ${total}*\n\n✏️ Para modificar, dime qué quieres cambiar."` |
| `removeConfirm` | `string` | Confirmación remover item | `{product_name}`, `{variant_name}` | `"✅ *{product_name} - {variant_name}* removido del carrito"` |
| `updateConfirm` | `string` | Confirmación actualizar qty | `{product_name}`, `{quantity}` | `"✅ *Cantidad actualizada*\n\n{product_name}: {quantity} unidades"` |
| `quantityInvalid` | `string` | Cantidad fuera de rango | - | `"❌ La cantidad debe estar entre 1 y 99 unidades."` |
| `productNotFound` | `string` | Producto no encontrado en búsqueda | `{query}` | `"😔 No encontré \"{query}\"\n\nEscribe \"buscar\" para ver el catálogo."` |
| `productMultipleOptions` | `string` | Múltiples productos encontrados | `{product_list}` | `"Encontré varias opciones:\n\n{product_list}\n\n¿Cuál quieres agregar?"` |
| `variantMultipleOptions` | `string` | Múltiples variantes disponibles | `{product_name}`, `{variant_list}` | `"*{product_name}* tiene varias opciones:\n\n{variant_list}\n\n¿Cuál variante quieres?"` |
| `itemNotInCart` | `string` | Item no encontrado en carrito | `{query}`, `{items_list}` | `"No encontré \"{query}\" en tu carrito.\n\nTu carrito tiene:\n{items_list}"` |
| `cartEmptyNoAction` | `string` | Carrito vacío al intentar acción | `{action}` | `"🛒 Tu carrito está vacío, no hay nada que {action}."` |
| `genericError` | `string` | Error genérico | `{action}` | `"❌ Error al {action}. Intenta de nuevo."` |
| `unknownIntent` | `string` | Intent no reconocido | - | `"No entendí tu mensaje. Escribe 'ayuda' para ver opciones."` |

### PlaybookService.getMessage (REQ-02)

```typescript
getMessage(
  merchant: MerchantPlaybookData,
  key: keyof PlaybookMessages,
  placeholders?: Record<string, string | number>
): string
```

**Comportamiento:**
1. Obtiene mensaje de `PlaybookConfig.messages[key]` (con fallback a defaults)
2. Aplica interpolación simple con template literals: `{placeholder}` → valor
3. Aplica `botPersonality.style` (modificadores de emoji/tono si aplica)
4. Retorna string final

**Ejemplo:**
```typescript
getMessage(merchant, 'cartSummaryHeader', { item_count: 3, item_word: 'productos' })
// → "🛒 *Tu carrito* (3 productos)"
```

### PlaybookService.mergePlaybookConfig update (REQ-01)

Extender método existente para soportar `botPersonality` y nuevos campos `messages`.

### UpdatePlaybookConfigDto validation (REQ-08)

Validar nuevos campos con:
- `@IsOptional()` 
- `@IsString()` para strings
- `@IsEnum()` para `style` y `emojiUsage`
- `@ValidateNested()` para `botPersonality`

## Comportamiento

### Happy path:
1. Merchant tiene playbook con `botPersonality.style = 'enthusiastic'` y mensajes custom
2. Cliente dice "ver carrito" → ViewCartFlow llama `getMessage(merchant, 'cartEmpty')` → retorna mensaje personalizado del merchant
3. Cliente dice "buscar camisas" → SearchCatalogFlow llama `getMessage(merchant, 'searchResultsHeader', { query: 'camisas', count: 5 })` → retorna "🔍 Resultados para "camisas" (5):" con tono del merchant
4. Merchant SIN playbook custom → defaults de industria aplican transparentemente

### Edge cases:
- **Merchant sin industry:** usa `GenericPlaybookDefaults`
- **Placeholder faltante:** no crashea, retorna string con `{placeholder}` sin reemplazar (log warning)
- **Key inexistente:** fallback a mensaje genérico (log warning)
- **botPersonality.style undefined:** usa defaults (friendly)
- **Backward compat:** merchants con playbook antiguo (sin nuevos campos) siguen funcionando con defaults

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `PlaybookConfig` interface tiene `botPersonality` y 18 nuevos campos en `messages` | test: `playbook-config.interface.spec.ts` verifica tipos |
| AC-02 | `PlaybookService.getMessage()` interpola placeholders correctamente | test: `playbook.service.spec.ts` > `getMessage with placeholders` |
| AC-03 | CartFlow NO tiene strings hardcoded, usa `getMessage()` para todos los mensajes | test: `cart.flow.spec.ts` + grep verifica ausencia de backticks con emojis |
| AC-04 | SearchCatalogFlow NO tiene strings hardcoded, usa `getMessage()` | test: `search-catalog.flow.spec.ts` + grep |
| AC-05 | HelpFlow NO tiene strings hardcoded, usa `getMessage()` | test: `help.flow.spec.ts` + grep |
| AC-06 | 4 industry presets contienen todos los 23 campos de `messages` + `botPersonality` | test: `playbook-defaults.spec.ts` verifica completeness |
| AC-07 | Tests E2E: bot responde con copy del merchant (no defaults) cuando hay custom config | test: e2e `conversation.e2e-spec.ts` con merchant custom |
| AC-08 | `PATCH /merchants/me/playbook` acepta `botPersonality` y valida correctamente | test: e2e `merchant-settings.e2e-spec.ts` |

## Plan de pruebas

### Unit:
- `playbook.service.spec.ts`:
  - `getMessage()` con placeholders simples
  - `getMessage()` con placeholder faltante (no crashea)
  - `getMessage()` con key inexistente (fallback)
  - `mergePlaybookConfig()` soporta `botPersonality` y nuevos `messages`
- `cart.flow.spec.ts`: mock `PlaybookService`, verifica llamadas a `getMessage()`
- `search-catalog.flow.spec.ts`: idem
- `help.flow.spec.ts`: idem
- `playbook-defaults.spec.ts`: verifica que cada preset tiene todos los campos

### Integration:
- `conversation.e2e-spec.ts`:
  - Cliente envía "ver carrito" sin items → responde con `cartEmpty` del merchant
  - Cliente envía "buscar XYZ" sin resultados → responde con `searchNoResults` del merchant
  - Merchant con custom `botPersonality.style = 'minimal'` → respuestas sin emojis
  - Merchant con custom `signatureEmoji = '🔥'` → respuestas incluyen emoji
- `merchant-settings.e2e-spec.ts`:
  - `PATCH /merchants/me/playbook` con `botPersonality` → actualiza OK
  - `PATCH /merchants/me/playbook` con nuevo campo de `messages` → actualiza OK

### Manual (opcional):
- Verificar 1 merchant de cada industria (ropa, belleza, minimarket) → mensajes correctos
- Verificar que GreetingFlow sigue funcionando (ya usa PlaybookService)

## DoD

- [ ] Todos los AC tienen evidencia
- [ ] Sin scope creep (solo refactor de mensajes a PlaybookConfig)
- [ ] `botPersonality.style` presets documentados (friendly, professional, enthusiastic, minimal)
- [ ] Cero strings hardcoded con emojis en flows (grep verifica)
- [ ] Guardrails: bot NO inventa precio/stock/políticas/ETA (sin cambios — ya está)
- [ ] PII: sin cambios (no aplica)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: sin migraciones (solo code changes)
- [ ] Backward compat: merchants con playbook antiguo siguen funcionando
- [ ] `.env.example`: sin cambios (no hay nuevas env vars)

## Constraints

- **NO usar Handlebars** (eso es Bloque 7 PR-22) — solo template literals simples
- **NO crear tabla TemplatePack** (eso es Bloque 7 PR-20) — todo en PlaybookConfig (Prisma JSON field)
- **Zero breaking changes** — merchants existentes siguen funcionando sin actualizar
- Interpolación simple: `{placeholder}` → `String(value)` sin lógica condicional
- `botPersonality.style` aplica modificadores simples (no IA/LLM para transformar tono)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Merchants con playbook custom existente rompen | Medio | Alto | Backward compat: nuevos campos son opcionales, fallback a defaults |
| Placeholders inconsistentes entre flows | Bajo | Medio | Convención: snake_case, documentar en tabla de contratos |
| `getMessage()` crashea con placeholder null | Bajo | Medio | Defensive: `String(value ?? '')` |
| Tests no detectan strings hardcoded residuales | Medio | Medio | Grep en CI: `/return .*[😔❌✅🛒]/` debe retornar 0 matches en flows |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| - | - | - |

---

## Ejemplo de mensajes completos (para industry presets)

### helpMenu (ejemplo):
```
📋 *Opciones disponibles*

🔍 *Buscar productos*
Simplemente escribe lo que buscas
Ejemplo: "busco zapatillas", "tienes camisas azules"

🛒 *Ver carrito*
Escribe "ver carrito" o "carrito"

❓ *Ayuda*
Escribe "ayuda" o "menú" para ver estas opciones

💬 *Hablar con un humano*
Escribe "hablar con agente" o "ayuda humana"

---

¿En qué puedo ayudarte?
```

### botPersonality presets (aplicados en getMessage):

| Style | Emoji Usage | Tone | Ejemplo modificador |
|-------|-------------|------|---------------------|
| `friendly` | `moderate` | Cercano, conversacional | Agrega "😊" al final de confirmaciones |
| `professional` | `none` | Formal, conciso | Sin emojis excepto signatureEmoji |
| `enthusiastic` | `frequent` | Energético, expresivo | Agrega "✨" "🎉" en confirmaciones |
| `minimal` | `none` | Directo, sin adornos | Solo texto, sin emojis |
