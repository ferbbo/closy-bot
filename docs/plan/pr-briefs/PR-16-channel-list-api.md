# Brief — PR-16 — Channel List API

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-16-channel-list-api.md`
> **Issue:** #63
> **Regla**: Máx 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Exponer endpoint `GET /channels` para que un merchant autenticado pueda listar todos sus channels conectados (WhatsApp, Instagram futuro), habilitando visibilidad de canales en UI futura.

## Scope fence

### ✅ Included

- Endpoint `GET /channels` → lista channels del merchant autenticado
- Service: `ChannelListService.getChannels(merchantId)` usando `ChannelRepository.findByMerchantId()` existente
- DTO: `ChannelListItemDto` (id, type, displayName, status, webhookSubscribed, lastWebhookAt, createdAt)
- Guard: `SessionAuthGuard` (requiere sesión OIDC activa)
- Tests unit + e2e (happy path + edge cases)
- Actualizar `BACKEND-EXECUTION-GUIDE.md` con cURL example (fix referencia incorrecta actual)

### ❌ Excluded

- Filtrado avanzado (por type, status) — diferido para V2
- Paginación (MVP: lista completa) — diferido para V2
- Sorting adicional (ya ordenados por `createdAt DESC`) — diferido para V2
- CRUD de channels (crear/editar/eliminar) — solo lectura en este PR
- Exposición de `credentials` en DTO (seguridad: no exponer accessToken)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Endpoint GET /channels con auth SessionAuthGuard | TBD | AC-01, AC-02 |
| REQ-02 | ChannelListService + DTO sin credentials | TBD | AC-03, AC-04 |
| REQ-03 | Tests E2E + unit para coverage completo | TBD | AC-05 |
| REQ-04 | Docs actualizadas con cURL example | TBD | AC-06 |

## Paths a tocar (concretos)

- `apps/api/src/channels/channel-list.service.ts` (nuevo)
- `apps/api/src/channels/channel-health.controller.ts` (agregar endpoint GET /channels) OR
- `apps/api/src/channels/channel-list.controller.ts` (nuevo, alternativa)
- `apps/api/src/channels/dto/channel-list.dto.ts` (nuevo)
- `apps/api/test/channel-list.e2e-spec.ts` (nuevo) OR extender `apps/api/test/channel-health.e2e-spec.ts`
- `docs/BACKEND-EXECUTION-GUIDE.md` (fix + agregar section "Listar Channels")

**Nota arquitectura:** Controller puede extender `ChannelHealthController` o ser separado. Recomendación: agregar al existente para cohesión (mismos guards, mismas dependencias).

## Contratos / Interfaces

### API Consumer Experience (CRITICAL)

**Problema actual:**
UI no tiene forma de listar channels del merchant. Debe inferir channelId desde callback de onboarding.

**Solución:**
UI puede listar channels para mostrar en dashboard/settings.

```javascript
// UI ejemplo: listar channels del merchant autenticado
fetch('/channels', {
  method: 'GET',
  credentials: 'include', // incluye cookie session_id
})
  .then(res => res.json())
  .then(channels => {
    // Renderizar lista: nombre, status, último webhook, etc.
  });
```

### Endpoints

**Nuevo endpoint:**
- **GET** `/channels`
- Auth: `SessionAuthGuard` (cookie `session_id`)
- Response: `ChannelListItemDto[]`

```typescript
[
  {
    "id": "ch_abc123",
    "type": "WHATSAPP",
    "displayName": "Sucursal Centro",
    "status": "connected",
    "webhookSubscribed": true,
    "lastWebhookAt": "2026-02-19T10:30:00Z",
    "createdAt": "2026-02-15T08:00:00Z"
  },
  {
    "id": "ch_def456",
    "type": "WHATSAPP",
    "displayName": "Sucursal Norte",
    "status": "error",
    "webhookSubscribed": false,
    "lastWebhookAt": null,
    "createdAt": "2026-02-18T14:30:00Z"
  }
]
```

### DTOs / payloads

**ChannelListItemDto:**
```typescript
export class ChannelListItemDto {
  id: string;
  type: ChannelType; // 'WHATSAPP' | 'INSTAGRAM'
  displayName: string;
  status: ChannelStatus; // 'pending' | 'connected' | 'error'
  webhookSubscribed: boolean;
  lastWebhookAt: Date | null;
  createdAt: Date;
}
```

**Excluido por seguridad:**
- `credentials` (contiene accessToken, appSecret)
- `merchantId` (implícito: viene del merchant autenticado)
- `externalId` (phone_number_id, page_id - dato interno)

### Errores

| Código | Condición | Response |
|--------|-----------|----------|
| 401 | Sin sesión (cookie inválida o ausente) | `{ "statusCode": 401, "message": "Unauthorized" }` |
| 200 | Merchant sin channels | `[]` (array vacío) |
| 200 | Merchant con channels | `[ChannelListItemDto, ...]` |

### Persistencia (Prisma)

**Modelo existente:**
```prisma
model Channel {
  id                String        @id @default(cuid())
  merchantId        String
  type              ChannelType
  displayName       String
  status            ChannelStatus
  webhookSubscribed Boolean
  lastWebhookAt     DateTime?
  isActive          Boolean       @default(true)
  createdAt         DateTime      @default(now())
  // ... otros campos
}
```

**Query:**
```typescript
// ChannelRepository.findByMerchantId() ya existe
prisma.channel.findMany({
  where: {
    merchantId,
    isActive: true,
  },
  orderBy: {
    createdAt: 'desc',
  },
});
```

## Comportamiento

### Happy path

1. UI/cliente envía `GET /channels` con cookie `session_id` válida
2. `SessionAuthGuard` valida sesión → extrae `merchant.id`
3. `ChannelListService.getChannels(merchantId)` llama `ChannelRepository.findByMerchantId()`
4. Repository retorna channels donde `isActive=true` y `merchantId` coincide
5. Service mapea a `ChannelListItemDto[]` (excluye credentials)
6. Controller retorna 200 + array de DTOs

### Edge cases

**Merchant sin channels (recién creado, no ha hecho onboarding):**
- Repository retorna `[]`
- Service retorna `[]`
- Controller retorna 200 + `[]` (array vacío)

**Merchant con channels pero todos inactivos (`isActive=false`):**
- Repository filtra por `isActive=true` → retorna `[]`
- Service retorna `[]`
- Controller retorna 200 + `[]`

**Sesión expirada o inválida:**
- `SessionAuthGuard` lanza `UnauthorizedException`
- Controller retorna 401 Unauthorized

**Merchant con múltiples channels (diferentes tipos):**
- Repository retorna todos (WhatsApp, Instagram futuro)
- Service mapea todos
- Controller retorna 200 + array con todos los channels

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | GET /channels con sesión válida → 200 + lista de channels | test: `GET /channels authenticated with session returns channel list` |
| AC-02 | GET /channels sin sesión → 401 Unauthorized | test: `GET /channels without session returns 401` |
| AC-03 | Merchant sin channels → 200 + `[]` (array vacío) | test: `GET /channels for merchant without channels returns empty array` |
| AC-04 | DTO no expone `credentials` ni datos sensibles | test: unit test `ChannelListService maps to safe DTO` |
| AC-05 | Solo retorna channels con `isActive=true` | test: `GET /channels filters inactive channels` |
| AC-06 | BACKEND-EXECUTION-GUIDE.md actualizado con cURL | doc review: sección presente con cookie example |

## Plan de pruebas

### Unit

- `ChannelListService.getChannels()`:
  - Mock repository → retorna channels
  - Verifica mapeo a DTO (sin credentials)
  - Verifica orden (createdAt desc)

### Integration (E2E)

- `GET /channels`:
  - Con sesión válida → 200 + array de channels
  - Sin cookie → 401
  - Merchant sin channels → 200 + `[]`
  - Merchant con múltiples channels → 200 + array completo
  - Verificar DTO no incluye `credentials`
  - Verificar solo channels con `isActive=true`

### Manual (si aplica)

- cURL desde `BACKEND-EXECUTION-GUIDE.md`:
  ```bash
  # Primero login (obtener cookie)
  # Luego listar channels
  curl -X GET http://localhost:3000/channels \
    -H "Cookie: session_id=<session-id-from-login>"
  ```

## DoD

- [ ] Todos los AC tienen evidencia (tests + doc actualizado)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Estado persistido en Postgres (sin lógica solo en memoria) — N/A (solo lectura)
- [ ] Idempotencia implementada y testeada — N/A (GET idempotente por naturaleza)
- [ ] Guardrails: bot NO inventa precio/stock/políticas/ETA — N/A (no hay bot en este PR)
- [ ] PII minimizada y sin logs de datos sensibles — ✅ (DTO excluye credentials)
- [ ] **API endpoints testeable con cURL sin UI** ✅
- [ ] **Auth method es consistente (SessionAuthGuard)** ✅
- [ ] **cURL example funciona copy-paste** ✅ (incluido en AC-06)
- [ ] **BACKEND-EXECUTION-GUIDE.md actualizado ANTES de merge** ✅ (incluido en AC-06)
- [ ] `pnpm lint` y `pnpm test` pasan
- [ ] DB: migrations incluidas — N/A (sin cambios de schema)

## Constraints

- Guardrails: N/A (no hay LLM/bot en este PR)
- PII: DTO excluye `credentials` (accessToken, appSecret) por seguridad
- Security: Solo retorna channels del merchant autenticado (SessionAuthGuard + filter by merchantId)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Exposición accidental de credentials | Baja | Alto | DTO explícito sin campo credentials, test de validación |
| Merchant ve channels de otro merchant | Baja | Alto | SessionAuthGuard + repository filter by merchantId |
| Performance con muchos channels (>100) | Baja | Medio | MVP: sin paginación, diferir a V2 si necesario |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| - | - | - |
