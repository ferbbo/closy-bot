# Brief — PR-FE-03 — Dashboard: Channels UI

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-03-channels-ui.md`
> **Issue**: [#106](https://github.com/ferbbo/closy-bot/issues/106)
> **Parallel Mode**: `true`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear página `/dashboard/channels` en el merchant dashboard que lista los canales conectados con sus estados de salud, permite ejecutar acciones de recovery (retry webhook), y gatea la conexión de múltiples canales según feature flags (MVP = single WhatsApp, B2 = multi-channel).

## Scope fence

### ✅ Included

- Página `/dashboard/channels` con layout responsive (mobile-first)
- Componente `ChannelCard` mostrando: displayName, type, status badge, lastWebhookAt
- Panel de health con: webhookSubscribed, errorCount, recentErrors, recommendation
- Botón "Retry Webhook" consumiendo `POST /channels/:id/retry-webhook`
- CTA "Conectar WhatsApp" (redirect a `/onboarding?flow=add_channel`) si no hay canales
- Feature flag gating: ocultar botón "Conectar otro canal" si `isMultiChannelEnabled === false`
- Error handling: 401 → logout redirect, 403 → "No tienes acceso", 429 → rate limit message
- Loading states con Skeleton de shadcn/ui
- Empty state cuando no hay channels conectados
- TanStack Query hooks: `useChannels()`, `useChannelHealth(id)`, `useRetryWebhook(id)`

### ❌ Excluded

- CRUD completo de canales (edit displayName, delete channel) — futuro
- Instagram channel UI — requiere `isInstagramEnabled` flag (B2)
- Channel settings modal (webhook URL custom, etc.) — futuro
- Real-time updates con WebSockets — polling manual OK para MVP
- Logs de mensajes por canal — PR separado
- Filtros/búsqueda de canales — no necesario para single-channel MVP
- Notificaciones push de health status — futuro

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear página `/dashboard/channels` consumiendo `GET /channels` (PR-16) | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-01, AC-02 |
| REQ-02 | Componente `ChannelCard` con status badges (connected/pending/error) | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-03 |
| REQ-03 | Panel de health expandible por canal con `GET /channels/:id/health` | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-04, AC-05 |
| REQ-04 | Botón "Retry Webhook" con loading state y feedback | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-06, AC-07 |
| REQ-05 | CTA "Conectar WhatsApp" si array de channels está vacío | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-08 |
| REQ-06 | Feature flag gating con `useFeatures()` para multi-channel | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-09 |
| REQ-07 | Error handling completo (401, 403, 429, network) | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-10 |
| REQ-08 | Loading states con Skeleton components | [#106](https://github.com/ferbbo/closy-bot/issues/106) | AC-11 |

> **Nota**: Todos los REQs apuntan al mismo issue (se crea post-BRIEF GATE).

## Paths a tocar (concretos)

### Nuevos

```
apps/dashboard/src/
├── app/
│   └── dashboard/
│       └── channels/
│           ├── page.tsx                      # Página principal (REQ-01)
│           └── components/
│               ├── channel-card.tsx          # Card por canal (REQ-02)
│               ├── channel-health-panel.tsx  # Panel expandible (REQ-03)
│               ├── retry-webhook-button.tsx  # Botón con mutation (REQ-04)
│               └── empty-channels-state.tsx  # Empty state (REQ-05)
├── hooks/
│   └── use-channels.ts                       # TanStack Query hooks (REQ-01, REQ-03, REQ-04)
└── lib/
    └── api.ts                                # Agregar interfaces Channel (modificado)
```

### Modificados

- `apps/dashboard/src/lib/api.ts` — agregar interfaces `Channel`, `ChannelHealth`, request/response types
- `apps/dashboard/src/app/dashboard/layout.tsx` — ya tiene nav link "Canales" (verificar activo)

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Merchant con 1 canal conectado (MVP default)

1. User navega a `/dashboard/channels`
2. UI muestra 1 `ChannelCard` con:
   - Badge verde "Conectado"
   - Nombre: "Mi WhatsApp Ventas"
   - Tipo: WhatsApp
   - Última actualización: "Hace 2 horas"
3. User click en card → expande health panel:
   - Webhook: ✅ Suscrito
   - Errores recientes: 0
   - Recomendación: "Todo OK"
4. No se muestra botón "Conectar otro canal" (MVP mode)

#### Escenario 2: Merchant sin canales (onboarding incompleto)

1. User navega a `/dashboard/channels`
2. UI muestra empty state:
   - Icono ilustrativo
   - Texto: "No tienes canales conectados"
   - Botón CTA: "Conectar WhatsApp" → redirect `/onboarding?flow=add_channel`

#### Escenario 3: Retry webhook tras error

1. User ve canal con badge rojo "Error"
2. Health panel muestra:
   - Webhook: ❌ No suscrito
   - Recomendación: "Reintenta la suscripción del webhook"
3. User click "Retry Webhook" → botón muestra loading spinner
4. Backend responde 200 → badge cambia a "Conectado", toast success
5. Backend responde 429 → toast error "Demasiados intentos, espera 1 minuto"

#### Escenario 4: Multi-channel habilitado (B2 future)

1. `NEXT_PUBLIC_MULTI_CHANNEL_ENABLED=true` en env
2. User ve botón "Conectar otro canal" (visible)
3. Click → redirect a onboarding flow (implementación futura)

### API Endpoints Consumidos (Backend ya implementado en PR-14, PR-16)

| Endpoint | Method | Auth | Response | Error |
|----------|--------|------|----------|-------|
| `/channels` | GET | Session Cookie | `ChannelListItemDto[]` | 401 (no auth) |
| `/channels/:id/health` | GET | Session + Ownership | `ChannelHealthDto` | 401, 403, 404 |
| `/channels/:id/retry-webhook` | POST | Session + Ownership | `{ success: boolean, message: string }` | 401, 403, 429 |

### TypeScript Interfaces (`lib/api.ts`)

```typescript
// Backend response structure (from PR-16)
export interface Channel {
  id: string;
  merchantId: string;
  type: 'whatsapp' | 'instagram'; // MVP: solo whatsapp
  displayName: string;
  status: 'connected' | 'pending' | 'error';
  isActive: boolean;
  lastWebhookAt: string | null; // ISO date
  createdAt: string;
}

// Backend response structure (from PR-14)
export interface ChannelHealth {
  channelId: string;
  status: 'connected' | 'pending' | 'error';
  webhookSubscribed: boolean;
  lastWebhookAt: string | null;
  recentErrors: string[]; // max 3
  errorCount: number;
  lastErrorAt: string | null;
  recommendation: 'resubscribe_webhook' | 'refresh_credentials' | 'check_permissions' | null;
}

export interface RetryWebhookResponse {
  success: boolean;
  message: string;
}
```

### TanStack Query Hooks

```typescript
// apps/dashboard/src/hooks/use-channels.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => apiFetch<Channel[]>('/channels'),
    staleTime: 30_000, // 30s — reducir requests frecuentes
  });
}

export function useChannelHealth(channelId: string) {
  return useQuery<ChannelHealth>({
    queryKey: ['channels', channelId, 'health'],
    queryFn: () => apiFetch<ChannelHealth>(`/channels/${channelId}/health`),
    enabled: !!channelId, // Solo fetch si channelId existe
    staleTime: 10_000, // 10s — health puede cambiar rápido
  });
}

export function useRetryWebhook(channelId: string) {
  const queryClient = useQueryClient();
  
  return useMutation<RetryWebhookResponse, Error>({
    mutationFn: () => apiFetch<RetryWebhookResponse>(`/channels/${channelId}/retry-webhook`, {
      method: 'POST',
    }),
    onSuccess: () => {
      // Invalidar health para re-fetch actualizado
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'health'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}
```

## Comportamiento

### Happy path

1. User autenticado navega a `/dashboard/channels`
2. TanStack Query ejecuta `useChannels()` → `GET /channels` con cookie
3. Backend valida session → retorna array de channels
4. UI renderiza 1 `ChannelCard` por canal con status badge
5. User click en card → expande health panel
6. `useChannelHealth(id)` ejecuta → `GET /channels/:id/health`
7. Panel muestra webhook status, error count, recommendation
8. User click "Retry Webhook" → mutation ejecuta `POST /channels/:id/retry-webhook`
9. Backend procesa → retorna `{ success: true, message: "Webhook resubscribed" }`
10. Client invalida cache → health panel se actualiza con nuevo estado
11. Toast success aparece: "Webhook reconectado exitosamente"

### Edge cases

#### E1: No hay canales (onboarding incompleto)
- `GET /channels` retorna `[]`
- UI muestra `EmptyChannelsState` component
- CTA "Conectar WhatsApp" redirect a `/onboarding?flow=add_channel`

#### E2: Rate limit en retry webhook
- User hace 6 requests en 1 minuto
- Backend retorna 429 con header `Retry-After`
- Mutation captura error 429
- Toast error: "Demasiados intentos. Espera 60 segundos."
- Botón "Retry Webhook" se deshabilita por 60s

#### E3: Ownership violation (403)
- User modifica URL a `/channels/ch_otro_merchant/health`
- Backend retorna 403
- UI muestra toast error: "No tienes permiso para ver este canal"

#### E4: Network error / API down
- `fetch` lanza error de red
- TanStack Query reintenta (default 3 veces)
- Si falla → UI muestra banner: "Error de conexión. Reintentando..."
- User puede click botón "Reintentar" para refetch manual

#### E5: MVP mode con 1 canal (feature flag check)
- `useFeatures()` retorna `{ isMultiChannelEnabled: false }`
- UI **NO** renderiza botón "Conectar otro canal"
- Sidebar solo muestra link a `/dashboard/channels` (sin submenu)

#### E6: Channel status === 'pending' (post Meta signup, pre-webhook)
- Card muestra badge amarillo "Pendiente"
- Health panel: "Webhook aún no suscrito"
- Recommendation: "Webhook subscription en proceso (5-10min)"
- No retry button (backend skip si status=pending)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Página `/dashboard/channels` renderiza lista de channels desde `GET /channels` | Screenshot: card con nombre + badge |
| AC-02 | Request incluye cookie `session_id` (verified en Network tab) | DevTools Network: header Cookie presente |
| AC-03 | `ChannelCard` muestra status badge con color correcto (connected=green, error=red, pending=yellow) | Screenshot: 3 cards con diferentes status |
| AC-04 | Click en card expande health panel con datos de `GET /channels/:id/health` | Screenshot: panel abierto con webhook status |
| AC-05 | Health panel muestra recommendation text si presente | Screenshot: panel con text "Reintenta webhook subscription" |
| AC-06 | Click "Retry Webhook" ejecuta mutation, muestra loading, y actualiza UI | Video: click → spinner → toast success → badge green |
| AC-07 | Error 429 en retry muestra toast con mensaje rate limit | Screenshot: toast error "Demasiados intentos..." |
| AC-08 | Empty state visible cuando `channels.length === 0` | Screenshot: empty state con botón CTA |
| AC-09 | Botón "Conectar otro canal" oculto cuando `isMultiChannelEnabled === false` | Screenshot: página sin botón multi-channel en MVP mode |
| AC-10 | Error 401 redirect a `/login` (middleware) | Browser history: redirect automático |
| AC-11 | Loading state muestra Skeleton components mientras fetch | Screenshot: skeleton cards durante loading |

## Plan de pruebas

### Manual testing

**Setup:**
1. Backend running con PR-14, PR-16 mergeados
2. Merchant con 1 canal WhatsApp conectado (status=connected)
3. Dashboard running: `pnpm dev:dashboard`
4. Session cookie válida (login previo)

**Tests:**

| Test | Steps | Expected |
|------|-------|----------|
| T1: Lista channels | Navegar a `/dashboard/channels` | 1 ChannelCard visible con badge verde |
| T2: Health panel | Click en card | Panel expande con webhook status + error count |
| T3: Retry webhook | Setup channel con error, click "Retry" | Loading spinner → success toast → badge actualiza |
| T4: Empty state | Delete channel en DB, reload | Empty state con CTA "Conectar WhatsApp" |
| T5: Feature flag | `NEXT_PUBLIC_MULTI_CHANNEL_ENABLED=false`, reload | Botón "Conectar otro" NO visible |
| T6: Rate limit | Hacer 6 requests retry en <1min | 6to request muestra toast "Demasiados intentos" |
| T7: 403 ownership | Modificar URL a channel de otro merchant | Toast error "No tienes permiso" |
| T8: Mobile responsive | Resize browser a 375px width | Cards en columna, sin horizontal scroll |

### Automated testing (opcional para MVP, recomendado para B2)

- `useChannels.test.tsx` — mock fetch, verify query cache
- `useRetryWebhook.test.tsx` — mock mutation, verify invalidation
- `ChannelCard.test.tsx` — render con diferentes status, verify badge color

## DoD

- [ ] Todos los AC tienen evidencia (screenshots/video)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Página responsive funciona en mobile (375px) y desktop (1920px)
- [ ] Feature flag `isMultiChannelEnabled` correctamente gateado (test con MVP mode)
- [ ] Error handling completo: 401, 403, 429, network
- [ ] Loading states con Skeleton components (no flash de contenido vacío)
- [ ] Toast messages user-friendly (español, no stack traces)
- [ ] TypeScript types completos sin `any` en queries/mutations
- [ ] `pnpm build:dashboard` y `pnpm lint:dashboard` pasan sin errores
- [ ] No PII loggeada en console (solo IDs de canal, no credentials)
- [ ] TanStack Query cache configurado correctamente (staleTime, invalidation)
- [ ] Actualización de `BACKEND-EXECUTION-GUIDE.md` con sección "Testing Channels UI"

## Constraints

- **API Consumer-First**: endpoints consumidos ya existen (PR-14, PR-16)
- **Feature flags obligatorios**: usar `useFeatures()` hook para gating multi-channel
- **Mobile-first**: diseño debe funcionar en WhatsApp Web típico (375-768px)
- **No backend changes**: este PR es solo frontend, no modificar API

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Rate limit 429 bloquea merchant legítimo | Media | Alto | Clear UX feedback con timer countdown para retry |
| Network error sin retry rompe UX | Media | Medio | TanStack Query default retry (3x) + manual refetch button |
| Polling frecuente aumenta costos API | Baja | Medio | `staleTime: 30s` en channels, 10s en health (no real-time) |
| Feature flag mal configurado expone multi-channel en MVP | Baja | Alto | Test manual con `FEATURES_MODE=mvp` antes de merge |
| Empty state redirect loop si onboarding falla | Baja | Alto | Redirect con query param `?flow=add_channel`, onboarding detecta |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
