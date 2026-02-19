# Brief — PR-15 — Merchant Settings API: Playbook Config + Profile Update

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-15-merchant-settings-api.md`
> **Regla**: Máx 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Exponer endpoints HTTP para que un merchant autenticado pueda leer y actualizar su perfil (name, industry) y su `playbookConfig` JSON, habilitando self-service onboarding y configuración del bot conversacional.

## Scope fence

### ✅ Included

- Nuevo módulo `merchant-settings/` (controller + service)
- Endpoints protegidos con `SessionAuthGuard`:
  - `GET /merchants/me` → info merchant + playbookConfig actual
  - `PATCH /merchants/me` → actualizar name, industry
  - `PUT /merchants/me/playbook` → reemplazar playbookConfig completo
  - `PATCH /merchants/me/playbook` → merge parcial de playbookConfig
- DTOs con `class-validator`:
  - `UpdateMerchantDto` (name, industry)
  - `UpdatePlaybookConfigDto` (estructura completa validada)
  - `MerchantProfileResponseDto` (respuesta GET)
- Deep merge usando `PlaybookService.mergePlaybookConfig()` existente
- Validación con `PlaybookService.validatePlaybookConfig()` (a crear)
- Tests unit (service + controller) + e2e (endpoints)
- Actualizar `docs/BACKEND-EXECUTION-GUIDE.md` con cURL examples

### ❌ Excluded

- UI/frontend (solo API backend)
- Validación semántica deep (URLs válidas, regex patterns)
- Historial de cambios/versionado de playbookConfig
- Bulk operations (configurar múltiples merchants)
- Validación cross-field avanzada (ej: si industry=belleza, validar focusAreas specific)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Endpoint `GET /merchants/me` retorna merchant profile + playbookConfig | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-01, AC-02 |
| REQ-02 | Endpoint `PATCH /merchants/me` actualiza name/industry | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-03, AC-04 |
| REQ-03 | Endpoint `PUT /merchants/me/playbook` reemplaza playbookConfig completo | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-05, AC-06 |
| REQ-04 | Endpoint `PATCH /merchants/me/playbook` hace merge parcial | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-07, AC-08 |
| REQ-05 | Todos los endpoints requieren auth (`SessionAuthGuard`) | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-09 |
| REQ-06 | Validar estructura de `playbookConfig` (campos requeridos, tipos) | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-10 |
| REQ-07 | Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL examples | [#55](https://github.com/ferbbo/closy-bot/issues/55) | AC-11 |

## Paths a tocar (concretos)

```
apps/api/src/
  merchant-settings/
    merchant-settings.module.ts         # NEW
    merchant-settings.controller.ts     # NEW
    merchant-settings.service.ts        # NEW
    dto/
      update-merchant.dto.ts            # NEW
      update-playbook-config.dto.ts     # NEW
      merchant-profile-response.dto.ts  # NEW
    merchant-settings.controller.spec.ts  # NEW
    merchant-settings.service.spec.ts     # NEW
  services/
    playbook.service.ts                 # UPDATE: add validatePlaybookConfig()
    playbook.service.spec.ts            # UPDATE
  app.module.ts                         # UPDATE: import MerchantSettingsModule
test/
  merchant-settings.e2e-spec.ts         # NEW
docs/
  BACKEND-EXECUTION-GUIDE.md            # UPDATE: add Flujo 4
```

## Contratos / Interfaces

### Endpoints

#### GET /merchants/me
- **Auth:** Required (SessionAuthGuard)
- **Response 200:**
  ```typescript
  {
    id: string;
    name: string;
    industry: 'ropa' | 'belleza' | 'minimarket' | null;
    playbookConfig: PlaybookConfig | null;
  }
  ```
- **Response 401:** `{ statusCode: 401, message: "Unauthorized" }`

#### PATCH /merchants/me
- **Auth:** Required (SessionAuthGuard)
- **Body:** `UpdateMerchantDto`
  ```typescript
  {
    name?: string;        // min 1 char
    industry?: 'ropa' | 'belleza' | 'minimarket' | null;
  }
  ```
- **Response 200:** Updated merchant profile (same as GET)
- **Response 400:** Validation error

#### PUT /merchants/me/playbook
- **Auth:** Required (SessionAuthGuard)
- **Body:** `UpdatePlaybookConfigDto` (PlaybookConfig completo)
  ```typescript
  {
    industry: 'ropa' | 'belleza' | 'minimarket';
    llmPrompt: {
      tone: string;
      focusAreas: string[];
      commonQuestions: string[];
      upsellStrategy: string;
      emojiUsage: 'none' | 'moderate' | 'frequent';
    };
    checkoutQuestions: CheckoutQuestion[];
    messages: {
      greeting: string;
      addToCartConfirm: string;
      noStock: string;
      upsellTemplate: string;
      checkoutStart: string;
    };
    rules: {
      askSizeBeforeCart: boolean;
      askSkinTypeOnSearch: boolean;
      autoSubstitutions: boolean;
      upsellEnabled: boolean;
      maxRecommendations: number;
    };
  }
  ```
- **Response 200:** Updated merchant profile
- **Response 400:** Validation error

#### PATCH /merchants/me/playbook
- **Auth:** Required (SessionAuthGuard)
- **Body:** Partial `UpdatePlaybookConfigDto` (deep merge)
- **Response 200:** Merchant profile con playbookConfig mergeado
- **Response 400:** Validation error

### DTOs

**UpdateMerchantDto:**
```typescript
export class UpdateMerchantDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @IsEnum(Industry)
  @IsOptional()
  industry?: Industry | null;
}
```

**UpdatePlaybookConfigDto:**
```typescript
export class UpdatePlaybookConfigDto implements Partial<PlaybookConfig> {
  @IsEnum(Industry)
  @IsOptional()
  industry?: Industry;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => LlmPromptConfigDto)
  llmPrompt?: LlmPromptConfigDto;

  // ... resto de campos con class-validator
}
```

**MerchantProfileResponseDto:**
```typescript
export class MerchantProfileResponseDto {
  id!: string;
  name!: string;
  industry!: Industry | null;
  playbookConfig!: PlaybookConfig | null;
}
```

### Persistencia

- **Modelo:** `Merchant` (ya existe)
- **Campos:** `name`, `industry`, `playbookConfig` (JSON)
- **No nuevas migraciones** (campos ya existen desde PR-11)

### Idempotencia

**No aplica** (operaciones idempotentes por naturaleza: PUT/PATCH con mismos datos = mismo resultado).

## Comportamiento

### Happy path

1. Merchant autenticado → cookie `session_id` válida
2. `GET /merchants/me` → retorna profile + playbookConfig (o null si no configurado)
3. `PATCH /merchants/me` con `{ name: "Nueva Tienda" }` → actualiza solo name
4. `PUT /merchants/me/playbook` con config completo → reemplaza playbookConfig en DB
5. `PATCH /merchants/me/playbook` con `{ llmPrompt: { tone: "..." } }` → merge con config existente
6. Response incluye config resultante mergeado

### Edge cases

- **Sin auth:** 401 Unauthorized
- **PlaybookConfig inválido:** 400 Bad Request con detalles (`class-validator` errors)
- **Industry inválido:** 400 Bad Request
- **PATCH con config vacío:** No-op, retorna estado actual
- **PUT sin industry:** 400 (industry es required en PlaybookConfig)
- **PATCH/PUT con campos extra unknown:** ignorados (strip unknown keys)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | `GET /merchants/me` retorna merchant con id, name, industry, playbookConfig | test: `merchant-settings.e2e-spec.ts` → `should return merchant profile` |
| AC-02 | Sin auth → GET retorna 401 Unauthorized | test: `should return 401 if not authenticated` |
| AC-03 | `PATCH /merchants/me` con name válido actualiza merchant.name | test: `should update merchant name` |
| AC-04 | `PATCH /merchants/me` con industry válido actualiza merchant.industry | test: `should update merchant industry` |
| AC-05 | `PUT /merchants/me/playbook` reemplaza playbookConfig completo | test: `should replace entire playbook config` |
| AC-06 | `PUT /merchants/me/playbook` con config incompleto → 400 | test: `should reject invalid config on PUT` |
| AC-07 | `PATCH /merchants/me/playbook` hace deep merge (solo actualiza lo enviado) | test: `should merge partial playbook config` |
| AC-08 | `PATCH /merchants/me/playbook` con llmPrompt parcial actualiza solo tone | test: `should merge nested llmPrompt fields` |
| AC-09 | Todos los endpoints sin cookie session_id → 401 | test: `should protect all endpoints with SessionAuthGuard` |
| AC-10 | PlaybookConfig con focusAreas=string (no array) → 400 | test: `should validate PlaybookConfig structure` |
| AC-11 | `BACKEND-EXECUTION-GUIDE.md` incluye cURL examples para 4 endpoints | manual: check file has section "Flujo 4: Configuración Merchant" |

## Plan de pruebas

### Unit

- `merchant-settings.service.spec.ts`:
  - `getProfile()` retorna merchant + playbookConfig
  - `updateProfile()` actualiza name/industry
  - `replacePlaybookConfig()` valida y guarda config completo
  - `mergePlaybookConfig()` usa `PlaybookService.mergePlaybookConfig()`
- `merchant-settings.controller.spec.ts`:
  - Todos los endpoints llaman service correcto
  - Guard aplicado en todos los endpoints
- `playbook.service.spec.ts`:
  - `validatePlaybookConfig()` detecta campos faltantes/tipos incorrectos

### Integration

- `merchant-settings.e2e-spec.ts`:
  - Setup: crear merchant + session cookie
  - GET /merchants/me con auth válida → 200 con profile
  - GET /merchants/me sin auth → 401
  - PATCH /merchants/me actualiza name e industry
  - PUT /merchants/me/playbook con config válido → 200
  - PUT /merchants/me/playbook con config inválido → 400
  - PATCH /merchants/me/playbook merge parcial → 200 con config mergeado
  - PATCH llmPrompt.tone → solo actualiza tone, resto intacto

### Manual

- cURL examples en `BACKEND-EXECUTION-GUIDE.md` (AC-11)
- Verificar que config mergeado se usa en conversaciones (integration con PR-03.6)

## DoD

- [ ] Todos los AC tienen evidencia (tests pasan)
- [ ] Sin scope creep (solo endpoints CRUD merchant/playbook)
- [ ] Estado persistido en Postgres (campo `playbookConfig` JSON)
- [ ] Idempotencia N/A (PUT/PATCH son idempotentes por diseño)
- [ ] Guardrails: N/A (no involucra LLM)
- [ ] PII: N/A (solo merchant profile, no customer data)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB migrations: N/A (usa campos existentes)
- [ ] `BACKEND-EXECUTION-GUIDE.md` actualizado con Flujo 4 (cURL examples)

## Constraints

- **No inventar campos:** respetar estructura `PlaybookConfig` existente.
- **Validación estructura básica:** types correctos, campos required presentes.
- **No validación semántica deep:** no validar URLs, no validar que focusAreas sean coherentes con industry (eso es responsabilidad del usuario/UI).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Merchant sobrescribe config con PUT inválido y rompe conversaciones | `validatePlaybookConfig()` rechaza config incompleto (400). Fallback a industry defaults si config null/inválido. |
| Deep merge complejo, puede perder datos | Usar `PlaybookService.mergePlaybookConfig()` existente. Tests específicos para nested fields (AC-08). |
| Validación class-validator compleja para estructura anidada | Definir DTOs para cada sub-objeto (LlmPromptConfigDto, CheckoutQuestionDto, etc.). |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-19 | Brief DRAFT inicial | Usuario prioriza PR-15 para validar 3 flujos MVP |

---

## Tech Notes (Planner)

### Estructura de módulo

- Sigue patrón PR-12 (auth) y PR-14 (channel-health):
  - Controller con SessionAuthGuard
  - Service delega a PrismaService para actualizar Merchant
  - DTOs con class-validator para validación rigurosa

### Validación en service

```typescript
// merchant-settings.service.ts
async replacePlaybookConfig(merchantId: string, config: PlaybookConfig): Promise<Merchant> {
  // 1. Validate structure
  this.playbookService.validatePlaybookConfig(config); // throws BadRequestException si inválido
  
  // 2. Save to DB
  return this.prisma.merchant.update({
    where: { id: merchantId },
    data: { playbookConfig: config },
  });
}

async mergePlaybookConfig(merchantId: string, partialConfig: Partial<PlaybookConfig>): Promise<Merchant> {
  // 1. Get current merchant
  const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
  
  // 2. Get current playbook (with defaults if needed)
  const currentPlaybook = this.playbookService.getPlaybookForMerchant(merchant);
  
  // 3. Merge
  const merged = this.playbookService.mergePlaybookConfig(currentPlaybook, partialConfig);
  
  // 4. Validate merged result
  this.playbookService.validatePlaybookConfig(merged);
  
  // 5. Save
  return this.prisma.merchant.update({
    where: { id: merchantId },
    data: { playbookConfig: merged },
  });
}
```

### PlaybookService.validatePlaybookConfig()

**Implementar en `playbook.service.ts`:**

```typescript
validatePlaybookConfig(config: Partial<PlaybookConfig>): void {
  // Basic structure validation (throws BadRequestException if invalid)
  // For full validation, use class-validator in DTOs
  // This is a fallback/double-check
  
  if (!config) throw new BadRequestException('PlaybookConfig cannot be empty');
  
  // Check required top-level keys exist (if full config)
  const requiredKeys = ['industry', 'llmPrompt', 'messages', 'rules', 'checkoutQuestions'];
  const missingKeys = requiredKeys.filter(k => !(k in config));
  
  if (missingKeys.length > 0) {
    // Partial config is OK for PATCH, full config required for PUT
    // Let controller/DTO handle this distinction
  }
  
  // Validate nested structures exist if provided
  if (config.llmPrompt && typeof config.llmPrompt !== 'object') {
    throw new BadRequestException('llmPrompt must be an object');
  }
  
  // Add more checks as needed
}
```

### BACKEND-EXECUTION-GUIDE.md update

Agregar sección:

```markdown
## Flujo 4: Configuración Merchant (PR-15)

### Descripción
Permite al merchant autenticado ver y actualizar su perfil e industria, y configurar el comportamiento del bot via `playbookConfig` JSON.

### Pre-requisitos
1. Merchant autenticado (cookie `session_id` válida)

### Probar con cURL

#### 1. Ver perfil actual
```bash
curl -X GET http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>"
```

#### 2. Actualizar nombre tienda
```bash
curl -X PATCH http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Mi Nueva Tienda" }'
```

#### 3. Cambiar industria
```bash
curl -X PATCH http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{ "industry": "belleza" }'
```

#### 4. Reemplazar playbookConfig completo
```bash
curl -X PUT http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "industry": "ropa",
    "llmPrompt": {
      "tone": "Eres un asesor de moda friendly y cercano...",
      "focusAreas": ["Talla", "Color", "Estilo", "Ocasión"],
      "commonQuestions": ["¿Qué tallas tienen?", "¿Tienen envío gratis?"],
      "upsellStrategy": "Sugerir accesorios complementarios",
      "emojiUsage": "moderate"
    },
    "messages": {
      "greeting": "¡Hola! 👋 Bienvenido a {merchant_name}",
      "addToCartConfirm": "✅ Agregado al carrito",
      "noStock": "😔 Este producto está agotado",
      "upsellTemplate": "También te puede interesar: {product}",
      "checkoutStart": "Genial! Vamos a finalizar tu pedido"
    },
    "rules": {
      "askSizeBeforeCart": true,
      "askSkinTypeOnSearch": false,
      "autoSubstitutions": false,
      "upsellEnabled": true,
      "maxRecommendations": 3
    },
    "checkoutQuestions": []
  }'
```

#### 5. Actualizar solo el tono (merge parcial)
```bash
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "llmPrompt": {
      "tone": "Eres un vendedor profesional y elegante..."
    }
  }'
```

#### 6. Sin autenticación (debe fallar)
```bash
curl -X GET http://localhost:3000/merchants/me
# Respuesta esperada: 401 Unauthorized
```
```
