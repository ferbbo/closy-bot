# Brief — PR-SEARCH-NLU — NLU Entity Extraction para búsqueda estructurada

> **Status**: `APPROVED`
> **Scope**: `B2` (feature flag: `FEATURE_SEARCH_NLU`)
> **Archivo**: `docs/plan/pr-briefs/PR-SEARCH-NLU-entity-extraction.md`
> **Issue**: [#116](https://github.com/ferbbo/closy-bot/issues/116)
> **Parallel Mode**: `false`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Agregar capa de extracción de entidades (NLU) al pipeline de búsqueda de catálogo para parsear filtros estructurados (precio, talla, color) del texto del usuario, eliminando ruido y habilitando filtros SQL precisos sobre variantes. 100% TypeScript puro (sin ML/embeddings), gated por feature flag para modo B2.

## Scope fence

### ✅ Included

- Nuevo `QueryParserService` en `apps/api/src/orchestrator/nlu/query-parser.service.ts`
- Extracción de precio via Regex: `"desde 85000"` → `{ priceMin: 85000 }`, `"hasta 100k"` → `{ priceMax: 100000 }`, rangos `"80-120k"`
- Extracción de talla via Regex + lista fija: `XS, S, M, L, XL, XXL, 28..44` → `{ size: 'M' }`
- Extracción de color via Levenshtein ≤ 2 contra `COLOR_DICT` (~30 colores): `"blancas"` → `{ color: 'blanco' }`
- Interfaz `ParsedQuery { cleanText: string; filters: { priceMin?, priceMax?, size?, color? } }`
- Modificación de `SearchCatalogFlow.handle()` para usar `ParsedQuery` (gated por feature flag)
- Modificación de `CatalogService.searchProducts()`: parámetro `filters?` opcional
- Modificación de `ProductRepository.searchFts()`: WHERE clauses condicionales (NULL-check)
- Registro de `QueryParserService` en `OrchestratorModule`
- Tests unitarios `query-parser.service.spec.ts` (precio, talla, color, combinados, sin filtros)
- Test regresión: query sin filtros (`"jeans"`) → pipeline actual sin cambios
- Test con `FEATURES_MODE=mvp` → `isSearchNluEnabled()` retorna `false`, todos los tests pasan
- cURL example en `BACKEND-EXECUTION-GUIDE.md` (búsqueda con filtros)

### ❌ Excluded

- Vector embeddings / pgvector / semantic search
- Modelos ML / spaCy / frameworks NLP externos
- Sinonimia semántica (más allá de Levenshtein básico)
- Filtro por categoría (diferente scope)
- UI de filtros en dashboard
- Paquetes npm nuevos (Levenshtein se implementa inline ~15 líneas)
- Migración DB (no se tocan modelos, solo queries)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | `QueryParserService.parse(query)` extrae precio con Regex: `"desde X"`, `"hasta Y"`, `"X-Y"`, `"X a Y"`, soporta notación k/K (ej: `"100k"` = 100000) | TBD | AC-01 |
| REQ-02 | `QueryParserService.parse(query)` extrae talla con Regex + lista fija (`XS, S, M, L, XL, XXL, 28..44`): `"talla 32"` → `{ size: '32' }` | TBD | AC-02 |
| REQ-03 | `QueryParserService.parse(query)` extrae color con Levenshtein ≤ 2 contra `COLOR_DICT`: `"blancas"` → `{ color: 'blanco' }`, `"rojizas"` → `{ color: 'rojo' }` | TBD | AC-03 |
| REQ-04 | `ParsedQuery.cleanText` elimina entidades extraídas del query original para evitar ruido en FTS: `"jeans desde 85000 talla 32"` → `cleanText: "jeans"` | TBD | AC-04 |
| REQ-05 | `FeatureFlagsService.isSearchNluEnabled()` retorna `true` solo si `FEATURES_MODE !== 'mvp'` y `FEATURE_SEARCH_NLU=true` en env | TBD | AC-05 |
| REQ-06 | `SearchCatalogFlow.handle()` usa `QueryParserService` si feature flag activo, pasa `filters` a `CatalogService` | TBD | AC-06 |
| REQ-07 | `CatalogService.searchProducts()` acepta parámetro opcional `filters?: SearchFilters`, lo pasa a `ProductRepository.searchFts()` | TBD | AC-07 |
| REQ-08 | `ProductRepository.searchFts()` aplica WHERE clauses condicionales: `AND ($3::numeric IS NULL OR v.price >= $3)`, `AND ($4::text IS NULL OR v.name ILIKE '%' || $4 || '%')` | TBD | AC-08 |
| REQ-09 | Tests unitarios `query-parser.service.spec.ts` cubren: precio min/max/rango, talla, color, combinados, query sin filtros | TBD | AC-09 |
| REQ-10 | Test regresión: búsqueda `"jeans"` (sin filtros) funciona igual que antes (sin cambios en FTS/resultado) | TBD | AC-10 |
| REQ-11 | Test con `FEATURES_MODE=mvp` → feature flag desactivado, `QueryParserService` NO invocado, búsqueda funciona sin NLU | TBD | AC-11 |
| REQ-12 | Valores numéricos de ConfigService wrapeados con `Number()` al pasar a `$queryRaw` (guardrail AGENTS.md) | TBD | AC-12 |

> **Nota**: Todos los REQs apuntan al mismo issue (TBD post-BRIEF GATE).

## Paths a tocar (concretos)

- `apps/api/src/orchestrator/nlu/` (nuevo directorio)
  - `query-parser.service.ts` (nuevo)
  - `query-parser.service.spec.ts` (nuevo)
  - `types.ts` (nuevo, con `ParsedQuery`, `SearchFilters`, `COLOR_DICT`, `SIZE_LIST`)
- `apps/api/src/common/feature-flags/feature-flags.service.ts`:
  - Agregar método `get isSearchNluEnabled(): boolean`
- `apps/api/src/orchestrator/orchestrator.module.ts`:
  - Registrar `QueryParserService` en providers
- `apps/api/src/orchestrator/flows/search-catalog.flow.ts`:
  - Inyectar `QueryParserService` y `FeatureFlagsService`
  - Modificar `handle()` para parsear query si flag activo
- `apps/api/src/services/catalog.service.ts`:
  - Modificar firma de `searchProducts()`: agregar `filters?: SearchFilters`
  - Pasar `filters` a `productRepository.searchFts()`
- `apps/api/src/persistence/repositories/product.repository.ts`:
  - Modificar firma de `searchFts()`: agregar `filters?: SearchFilters`
  - Agregar WHERE clauses condicionales con NULL-check
- `.env.example`:
  - Agregar `FEATURE_SEARCH_NLU=false # NLU entity extraction for search (B2 only)`
- `apps/api/src/common/env.validation.ts`:
  - Agregar `FEATURE_SEARCH_NLU: Joi.boolean().optional().default(false)`
- Tests:
  - `apps/api/src/orchestrator/nlu/query-parser.service.spec.ts` (nuevo)
  - `apps/api/src/orchestrator/flows/search-catalog.flow.spec.ts` (extender)
  - `apps/api/test/catalog-search-nlu.e2e-spec.ts` (nuevo, e2e con flag on/off)
- `docs/BACKEND-EXECUTION-GUIDE.md`:
  - Sección nueva con cURL example de búsqueda con filtros implícitos

## Contratos / Interfaces

### Interfaces TypeScript (tipos públicos)

| Interface | Campos | Descripción |
|-----------|--------|-------------|
| `ParsedQuery` | `cleanText: string` | Query original sin entidades extraídas (para FTS) |
|  | `filters: SearchFilters` | Filtros estructurados extraídos |
| `SearchFilters` | `priceMin?: number` | Precio mínimo en unidades de moneda (ej: 85000) |
|  | `priceMax?: number` | Precio máximo |
|  | `size?: string` | Talla exacta (ej: `'32'`, `'M'`) |
|  | `color?: string` | Color normalizado (ej: `'blanco'`, `'rojo'`) |

### Constantes (readonly)

| Constante | Tipo | Valores |
|-----------|------|---------|
| `COLOR_DICT` | `readonly string[]` | 30 colores base: `['blanco', 'negro', 'rojo', 'azul', 'verde', 'amarillo', 'rosa', 'morado', 'naranja', 'gris', 'café', 'beige', 'crema', 'dorado', 'plateado', 'turquesa', 'coral', 'lavanda', 'menta', 'celeste', 'marino', 'vino', 'mostaza', 'oliva', 'terracota', 'salmon', 'lila', 'fucsia', 'cian', 'magenta']` |
| `SIZE_LIST` | `readonly string[]` | Tallas comunes: `['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '28', '29', '30', '32', '34', '36', '38', '40', '42', '44']` |

### QueryParserService (métodos públicos)

| Método | Entrada | Salida | Descripción |
|--------|---------|--------|-------------|
| `parse(query: string)` | `"jeans desde 85000 talla 32"` | `ParsedQuery` | Extrae entidades y retorna query limpio + filtros |

**Lógica interna (no código completo, solo descripción):**

| Paso | Regex/Algoritmo | Ejemplo |
|------|-----------------|---------|
| 1. Precio min | `/desde\s+(\d+k?)/i` | `"desde 85000"` → `priceMin: 85000` |
| 2. Precio max | `/hasta\s+(\d+k?)/i` | `"hasta 100k"` → `priceMax: 100000` |
| 3. Rango precio | `/(\d+k?)\s*[-a]\s*(\d+k?)/i` | `"80-120k"` → `priceMin: 80000, priceMax: 120000` |
| 4. Talla | `/talla\s+(XS\|S\|M\|L\|XL\|XXL\|\d{2})/i` | `"talla 32"` → `size: '32'` |
| 5. Color | Levenshtein(query_word, COLOR_DICT) ≤ 2 | `"blancas"` → `color: 'blanco'` |
| 6. Clean text | Remover matches de pasos 1-5 | `"jeans desde 85000 talla 32"` → `"jeans"` |

**Nota:** Implementación real es responsabilidad del Builder. Esta tabla define el contrato de entrada/salida, no el código completo.

### Feature Flag (FeatureFlagsService)

| Método/Property | Retorno | Condición |
|-----------------|---------|-----------|
| `isSearchNluEnabled` | `boolean` | `false` si `FEATURES_MODE === 'mvp'`, sino lee `FEATURE_SEARCH_NLU` env var (default `false`) |

### CatalogService (modificación de firma)

| Método Actual | Nueva Firma |
|---------------|-------------|
| `searchProducts(merchantId, query, limit)` | `searchProducts(merchantId, query, limit, filters?)` |

### ProductRepository (modificación searchFts)

| Parámetro Nuevo | Tipo | Uso en SQL |
|-----------------|------|------------|
| `filters` | `SearchFilters \| undefined` | `AND ($3::numeric IS NULL OR v.price >= $3) AND ($4::numeric IS NULL OR v.price <= $4) AND ($5::text IS NULL OR v.name ILIKE '%' || $5 || '%') AND ($6::text IS NULL OR v.name ILIKE '%' || $6 || '%')` |

**Nota:** Filtro de talla y color se aplican sobre `variant.name` en lugar de campos separados (no existe `variant.size` o `variant.color` en schema actual). Esto es suficiente para MVP B2.

### Idempotencia

No aplica (lectura/query, no mutación).

## Comportamiento

### Happy path (con feature flag activo)

1. Cliente envía mensaje: `"busco jeans desde 85000 talla 32"`
2. `SearchCatalogFlow.handle()` recibe mensaje
3. Feature flag check: `FeatureFlagsService.isSearchNluEnabled()` → `true`
4. `QueryParserService.parse("busco jeans desde 85000 talla 32")` → `{ cleanText: "jeans", filters: { priceMin: 85000, size: '32' } }`
5. `CatalogService.searchProducts(merchantId, "jeans", 5, filters)` →
6. `ProductRepository.searchFts(merchantId, "jeans", 5, filters)` ejecuta:
   ```sql
   WHERE to_tsvector('simple', search_text) @@ plainto_tsquery('simple', 'jeans')
     AND (v.price >= 85000)
     AND (v.name ILIKE '%32%')
   ```
7. Retorna solo variantes con precio ≥ 85000 y talla 32 en el nombre
8. Bot responde con productos filtrados

### Happy path (con feature flag desactivado — MVP mode)

1. Cliente envía mensaje: `"busco jeans desde 85000 talla 32"`
2. `SearchCatalogFlow.handle()` recibe mensaje
3. Feature flag check: `FeatureFlagsService.isSearchNluEnabled()` → `false`
4. NO invoca `QueryParserService`
5. Pasa query completo a `CatalogService.searchProducts(merchantId, "busco jeans desde 85000 talla 32", 5)` (sin filters)
6. FTS/sanitizeQuery funcionan como siempre → retorna productos con match en "jeans" (sin filtros precio/talla)
7. Bot responde con resultados generales

### Edge cases

- **Query sin filtros** (`"jeans"`): `parse()` retorna `{ cleanText: "jeans", filters: {} }` → SQL no agrega WHERE clauses → comportamiento idéntico a actual
- **Filtros sin query** (`"desde 85000 talla 32"`): `cleanText` vacío → `CatalogService` retorna [] (vacío) o mensaje de error (comportamiento a definir por Builder)
- **Color con typo leve** (`"blancas"` vs `"blanco"`): Levenshtein ≤ 2 → match → `color: 'blanco'`
- **Color con typo severo** (`"blancooooo"`): Levenshtein > 2 → no match → `color` no extraído → no filtro
- **Precio con notación k** (`"100k"`): Regex detecta `k` → multiplica por 1000 → `priceMin: 100000`
- **Talla fuera de lista** (`"talla 50"`): No match → `size` no extraído → no filtro
- **FEATURES_MODE=mvp**: Flag retorna `false` → NLU NO ejecuta → pipeline funciona como siempre

## Consumer Experience

**Sin feature flag (MVP — default):**
- Cliente: `"busco jeans desde 85000 talla 32"`
- Bot: Muestra productos con "jeans" en cualquier precio/talla (búsqueda actual FTS)

**Con feature flag (B2):**
- Cliente: `"busco jeans desde 85000 talla 32"`
- Bot: Muestra solo jeans con precio ≥ 85000 y "32" en el nombre de variante
- Cliente: `"camisas blancas hasta 150k"`
- Bot: Muestra solo camisas blancas con precio ≤ 150000
- Cliente: `"vestido rojo"`
- Bot: Muestra vestidos con "rojo" en descripción/tags

**Ventaja para merchant B2:**
- Mejora conversión al mostrar productos relevantes (sin ruido de precios fuera de rango)
- Reduce friction del cliente (no necesita navegar resultados irrelevantes)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `queryParser.parse("jeans desde 85000")` retorna `{ cleanText: "jeans", filters: { priceMin: 85000 } }` | test: `describe('QueryParserService - precio min')` |
| AC-02 | `queryParser.parse("camisas talla 32")` retorna `{ cleanText: "camisas", filters: { size: '32' } }` | test: `describe('QueryParserService - talla')` |
| AC-03 | `queryParser.parse("vestido blancas")` retorna `{ cleanText: "vestido", filters: { color: 'blanco' } }` (Levenshtein) | test: `describe('QueryParserService - color')` |
| AC-04 | `queryParser.parse("jeans desde 85000 talla 32")` retorna `cleanText: "jeans"` (sin "desde 85000 talla 32") | test: `describe('QueryParserService - cleanText')` |
| AC-05 | `FEATURES_MODE=mvp` → `featureFlags.isSearchNluEnabled` retorna `false` | test: `feature-flags.service.spec.ts` con mock env |
| AC-06 | `SearchCatalogFlow.handle()` invoca `QueryParserService.parse()` solo si feature flag activo | test: `search-catalog.flow.spec.ts` con mocks |
| AC-07 | `CatalogService.searchProducts()` acepta `filters` y lo pasa a repository | test: `catalog.service.spec.ts` |
| AC-08 | Query SQL incluye `AND v.price >= $3` solo si `filters.priceMin !== undefined` | test: e2e `catalog-search-nlu.e2e-spec.ts` |
| AC-09 | Tests unitarios cubren: precio min/max/rango, talla, color, combinados, sin filtros | archivo: `query-parser.service.spec.ts` |
| AC-10 | Búsqueda `"jeans"` (sin filtros) retorna mismos resultados que antes (regresión) | test: e2e `catalog-search-nlu.e2e-spec.ts` con query simple |
| AC-11 | Con `FEATURES_MODE=mvp`: búsqueda `"jeans desde 85000"` NO aplica filtro precio (comportamiento actual) | test: e2e con env var `FEATURES_MODE=mvp` |
| AC-12 | Valores `priceMin`/`priceMax` wrapeados con `Number()` antes de `$queryRaw` | code review: ProductRepository.searchFts() |

## Plan de pruebas

### Unit

- `query-parser.service.spec.ts`:
  - Extracción precio: `"desde 85000"`, `"hasta 100k"`, `"80-120k"`, `"80 a 120k"`
  - Extracción talla: `"talla 32"`, `"talla M"`, `"talla XL"`, `"sin talla"` (no match)
  - Extracción color: `"blancas"`, `"rojizas"`, `"azulejo"` (Levenshtein), `"verde limón"` (sin match)
  - Query combinado: `"jeans desde 85000 talla 32 azules"`
  - Query sin filtros: `"jeans"`
- `feature-flags.service.spec.ts`:
  - `FEATURES_MODE=mvp` → `isSearchNluEnabled` = `false`
  - `FEATURES_MODE=dev` + `FEATURE_SEARCH_NLU=true` → `true`
  - `FEATURES_MODE=dev` + `FEATURE_SEARCH_NLU` ausente → `false` (default)

### Integration

- `catalog.service.spec.ts`:
  - `searchProducts()` con `filters` llama a `searchFts()` con parámetros correctos
- `search-catalog.flow.spec.ts`:
  - Con feature flag ON: invoca `QueryParserService` y pasa `filters`
  - Con feature flag OFF: NO invoca `QueryParserService`, pasa query completo

### E2E

- `catalog-search-nlu.e2e-spec.ts`:
  - Setup: seed productos con precios variados (50k, 85k, 120k) y tallas (S, M, L, 32, 34)
  - Query `"jeans desde 85000"` con flag ON → retorna solo productos ≥ 85k
  - Query `"jeans desde 85000"` con flag OFF (`FEATURES_MODE=mvp`) → retorna todos los jeans (sin filtro)
  - Query `"jeans"` (sin filtros) con flag ON → retorna todos (regresión check)
  - Query `"camisas talla 32"` con flag ON → retorna solo variantes con "32" en nombre

### Manual (opcional)

- Via WhatsApp test: enviar `"busco jeans desde 85000 talla 32"` y verificar resultados se limitan correctamente

## DoD

- [ ] Todos los AC tienen evidencia (tests)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (no aplica — solo queries)
- [ ] Idempotencia implementada y testeada (no aplica — lectura)
- [ ] Guardrails: bot NO inventa precio/stock/políticas/ETA (no aplica — solo filtros de búsqueda)
- [ ] PII minimizada y sin logs de datos sensibles (no aplica — no maneja PII)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migrations incluidas (no aplica — sin cambios de schema)
- [ ] **Feature Flag B2**:
  - [ ] `FeatureFlagsService.isSearchNluEnabled()` implementado
  - [ ] Test con `FEATURES_MODE=mvp` pasa (NLU NO ejecuta)
  - [ ] Guard en `SearchCatalogFlow` valida flag antes de usar NLU
  - [ ] Env var `FEATURE_SEARCH_NLU` en `.env.example`
  - [ ] Env var validada en `env.validation.ts` (Joi)
- [ ] **API Consumer-First**:
  - [ ] cURL example en `BACKEND-EXECUTION-GUIDE.md` (búsqueda conversacional, no endpoint HTTP directo)
  - [ ] Errores de validación (query vacío) retornan mensaje claro
  - [ ] Sin cambios en API externa (cambio interno solo)
- [ ] **TypeScript/Build**:
  - [ ] `npx tsc --noEmit` = 0 errores
  - [ ] Todas las props de clase con `!` (si aplica)
  - [ ] `catch (error as Error)` en todos los catch blocks
  - [ ] Valores numéricos de ConfigService wrapeados con `Number()`
  - [ ] Nueva env var en `env.validation.ts` como `Joi.boolean()`

## Constraints

- Guardrails: el bot NO inventa precio/stock/políticas/ETA (no aplica — solo filtros de búsqueda).
- PII: minimizar y evitar logs con datos sensibles (no aplica — queries no contienen PII).
- **Sin paquetes npm nuevos**: Levenshtein se implementa inline en TypeScript (~15 líneas).
- **Backward compatibility**: Con feature flag OFF, búsqueda funciona exactamente como siempre.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Levenshtein inline ineficiente para COLOR_DICT largo | Performance | Limitar `COLOR_DICT` a 30 colores base, Levenshtein simple O(n²) aceptable para strings cortos |
| Filtro de talla/color en `variant.name` impreciso (no hay campos dedicados) | Falsos positivos/negativos | Documentar limitación en brief. En V2 considerar campos `size`/`color` en schema Variant |
| Query sin texto después de extraer filtros (`"desde 85000 talla 32"`) | Error 500 o resultados vacíos | Validar `cleanText` no vacío antes de FTS. Si vacío → retornar mensaje genérico ("Por favor especifica qué producto buscas") |
| Feature flag complicado de testear localmente | Developer friction | `.env.example` con comentario claro. Tests con `FEATURES_MODE=mvp` garantizan kill-switch funcional |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
