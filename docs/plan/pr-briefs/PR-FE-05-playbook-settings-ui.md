# Brief — PR-FE-05 — Dashboard: Playbook Settings UI

> **Status**: `APPROVED`
> **Scope**: `MVP`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-05-playbook-settings-ui.md`
> **Issue**: [#108](https://github.com/ferbbo/closy-bot/issues/108)
> **Branch**: `PR-FE-05-playbook-settings-ui`
> **Worktree**: `/Users/ferbbo/Documents/dev/sp/closy-bot-dev-pr-fe-05-playbook-settings-ui`
> **Parallel Mode**: `true`
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear página `/dashboard/settings` en el dashboard frontend para que el merchant autenticado pueda visualizar y editar su `PlaybookConfig` (mensajes del bot, reglas, tono LLM) y perfil básico (nombre, industria), consumiendo los endpoints de PR-15 (Merchant Settings API).

## Scope fence

### ✅ Included

- Página `/dashboard/settings` con sidebar navigation y tabs/accordion por sección
- 4 secciones principales:
  1. **Profile** (name, industry read-only en MVP "Retail General")
  2. **Messages** (greeting, cart confirmations, help menu, etc.)
  3. **Rules** (askSizeBeforeCart, upsellEnabled, maxRecommendations)
  4. **Guidelines** (llmPrompt: tone, focusAreas, commonQuestions, emojiUsage)
- Formularios con React Hook Form + Zod + shadcn/ui components
- API integration con TanStack Query (consume endpoints de PR-15):
  - `GET /merchants/me` para cargar config actual
  - `PATCH /merchants/me/playbook` para guardar cambios parciales
- Estado de guardado: Loading, Success, Error con toast notifications
- Validación client-side: campos requeridos, tipos correctos, max lengths
- Responsive mobile-first (accordion en mobile, tabs en desktop)
- Botones: "Guardar cambios", "Cancelar" (reset form)
- Preview de mensajes (read-only texto formateado con placeholders resaltados)

### ❌ Excluded

- Editor visual avanzado / Drag & drop builder (B2)
- Preview conversacional en vivo / Test de bot desde settings (PR futuro)
- Historial de cambios / versionado de playbookConfig (PR futuro)
- Selector de industria (MVP = "Retail General" fijo, industry read-only)
- FAQs editor (PR-FE-OB-2, dentro de wizard customize step, no aquí)
- `MerchantConfig` (payment methods, policies) — eso es wizard step-customize, no settings
- Upload de archivos / Media library
- Role-based access control (solo merchant owner)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear página `/dashboard/settings` con layout responsive | TBD | AC-01 |
| REQ-02 | Sección Profile: mostrar name (editable) e industry (read-only "Retail General") | TBD | AC-02 |
| REQ-03 | Sección Messages: form editable con TODOS los campos de `PlaybookMessages` | TBD | AC-03, AC-04 |
| REQ-04 | Sección Rules: toggles y inputs numéricos para `PlaybookRules` | TBD | AC-05 |
| REQ-05 | Sección Guidelines: form para `LlmPromptConfig` (tone, focusAreas array, emojiUsage) | TBD | AC-06 |
| REQ-06 | Integración API: cargar config con `GET /merchants/me` al montar | TBD | AC-07 |
| REQ-07 | Integración API: guardar cambios con `PATCH /merchants/me/playbook` | TBD | AC-08, AC-09 |
| REQ-08 | Validación client-side: campos requeridos, max lengths, tipos | TBD | AC-10 |
| REQ-09 | UX: toast notifications para success/error + loading states | TBD | AC-11 |
| REQ-10 | Botón "Cancelar" resetea form al estado original desde backend | TBD | AC-12 |

> **Nota**: Todos los REQs apuntarán al mismo issue (creado post-BRIEF GATE).

## Paths a tocar (concretos)

### Nuevos

```
apps/dashboard/src/
  app/
    dashboard/
      settings/
        page.tsx                      # NEW — main settings page
        loading.tsx                   # NEW — skeleton loading
        error.tsx                     # NEW — error boundary
  components/
    settings/
      profile-section.tsx             # NEW
      messages-section.tsx            # NEW
      rules-section.tsx               # NEW
      guidelines-section.tsx          # NEW
      settings-form-wrapper.tsx       # NEW — form state management
    ui/
      tabs.tsx                        # NEW — shadcn component (via CLI)
      accordion.tsx                   # NEW — shadcn component (via CLI)
      textarea.tsx                    # NEW — shadcn component (via CLI)
      switch.tsx                      # NEW — shadcn component (via CLI)
      badge.tsx                       # NEW — shadcn component (via CLI)
      toast.tsx + toaster.tsx         # NEW — shadcn component (via CLI)
  hooks/
    use-playbook-config.ts            # NEW — TanStack Query for GET/PATCH playbook
  lib/
    schemas/
      playbook-config.schema.ts       # NEW — Zod schemas para validación
  types/
    playbook.ts                       # NEW — TypeScript types (mirror backend interface)
```

### Modificados

- `apps/dashboard/src/app/dashboard/layout.tsx` — agregar link "Settings" en sidebar
- `apps/dashboard/src/lib/api.ts` — agregar método `patchPlaybookConfig()`

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Merchant edita mensaje de bienvenida

1. Merchant logueado navega a `/dashboard/settings`
2. Frontend hace `GET /merchants/me` → carga profile + playbookConfig
3. Merchant ve 4 tabs: Profile | Messages | Rules | Guidelines
4. Tab "Messages" activa → accordion con campos agrupados:
   - **Bienvenida y Ayuda** (greeting, helpMenu, unknownIntent)
   - **Carrito** (addToCartConfirm, cartEmpty, cartSummaryHeader, etc.)
   - **Checkout** (checkoutStart)
   - **Búsqueda** (searchNoResults, searchResultsHeader, productNotFound, etc.)
   - **Errores** (genericError, quantityInvalid, etc.)
5. Merchant edita `greeting` de `"¡Hola! Soy tu asistente..."` a `"¡Bienvenido a Mi Tienda! ¿En qué te puedo ayudar?"`
6. Hook Form detecta campo modificado (dirty state)
7. Botón "Guardar cambios" habilitado
8. Merchant click "Guardar" → frontend hace:
   ```typescript
   PATCH /merchants/me/playbook
   Body: { messages: { greeting: "¡Bienvenido a Mi Tienda! ¿En qué te puedo ayudar?" } }
   ```
9. Backend merge parcial → retorna config actualizado completo
10. TanStack Query invalida cache → form refresca con nuevo valor
11. Toast notification: "✅ Cambios guardados"

#### Escenario 2: Merchant habilita Upsell

1. Merchant activa tab "Rules"
2. Ve toggle switches:
   - `upsellEnabled` (OFF)
   - `askSizeBeforeCart` (OFF)
   - `autoSubstitutions` (OFF)
3. Input numérico: `maxRecommendations` (3)
4. Merchant toggle `upsellEnabled` → ON
5. Botón "Guardar cambios" → PATCH con `{ rules: { upsellEnabled: true } }`
6. Backend merge (solo actualiza `upsellEnabled`, resto intacto)
7. Toast: "✅ Reglas actualizadas"

#### Escenario 3: Error de validación

1. Merchant edita `greeting` → borra todo el texto → campo vacío
2. Frontend Zod validation: "greeting es requerido (min 1 char)"
3. Campo resaltado en rojo + error message inline
4. Botón "Guardar" deshabilitado mientras haya errores de validación
5. Merchant escribe texto nuevo → validación pasa → botón habilitado

#### Escenario 4: Cancelar cambios

1. Merchant edita varios campos (greeting, upsellEnabled, tone)
2. Form tiene dirty state (cambios sin guardar)
3. Merchant click "Cancelar"
4. Confirm dialog: "¿Descartar cambios sin guardar?"
5. Si confirma → `form.reset(originalData)` resetea al estado del backend
6. Si cancela confirm → vuelve al form con cambios

#### Escenario 5: Backend error (401 / 400 / 500)

1. Merchant edita y guarda
2. Backend retorna 400 (validación falló server-side)
3. TanStack Query onError → muestra toast rojo: "❌ Error al guardar: {mensaje backend}"
4. Form mantiene cambios (no se pierden)
5. Merchant puede corregir y reintentar

### API endpoints (consumidos desde PR-15)

#### GET /merchants/me
**Request:**
```typescript
fetch(`${API_URL}/merchants/me`, {
  method: 'GET',
  credentials: 'include', // Cookie session_id
});
```

**Response 200:**
```typescript
{
  id: string;
  name: string;
  industry: 'ropa' | 'belleza' | 'minimarket' | null;
  playbookConfig: PlaybookConfig | null;
}
```

#### PATCH /merchants/me
**Request:**
```typescript
fetch(`${API_URL}/merchants/me`, {
  method: 'PATCH',
  credentials: 'include',
  body: JSON.stringify({ name: "Nueva Tienda" }),
});
```

#### PATCH /merchants/me/playbook
**Request:**
```typescript
fetch(`${API_URL}/merchants/me/playbook`, {
  method: 'PATCH',
  credentials: 'include',
  body: JSON.stringify({
    messages: { greeting: "Nuevo mensaje" },
    rules: { upsellEnabled: true },
    // Deep merge — solo actualiza lo enviado
  }),
});
```

**Response 200:** Merchant profile con playbookConfig mergeado

### Frontend Types (mirror backend)

```typescript
// apps/dashboard/src/types/playbook.ts
export type Industry = 'ropa' | 'belleza' | 'minimarket';

export interface PlaybookConfig {
  industry: Industry;
  llmPrompt: LlmPromptConfig;
  checkoutQuestions: CheckoutQuestion[];
  messages: PlaybookMessages;
  rules: PlaybookRules;
  cartConfig?: CartConfig;
  botPersonality?: BotPersonality;
  faqs?: Faq[];
}

export interface PlaybookMessages {
  // 30+ campos según interface backend (PR-11 + PR-GAP-1)
  greeting: string;
  addToCartConfirm: string;
  noStock: string;
  upsellTemplate: string;
  checkoutStart: string;
  searchNoResults: string;
  searchResultsHeader: string;
  helpMenu: string;
  cartEmpty: string;
  cartSummaryHeader: string;
  removeConfirm: string;
  updateConfirm: string;
  genericError: string;
  unknownIntent: string;
  // ... (resto de campos de PlaybookMessages)
}

export interface PlaybookRules {
  askSizeBeforeCart: boolean;
  askSkinTypeOnSearch: boolean;
  autoSubstitutions: boolean;
  upsellEnabled: boolean;
  maxRecommendations: number;
}

export interface LlmPromptConfig {
  tone: string;
  focusAreas: string[];
  commonQuestions: string[];
  upsellStrategy: string;
  emojiUsage: 'none' | 'moderate' | 'frequent';
}
```

### Zod Schemas (validación client-side)

```typescript
// apps/dashboard/src/lib/schemas/playbook-config.schema.ts
import { z } from 'zod';

export const playbookMessagesSchema = z.object({
  greeting: z.string().min(1, "Mensaje de bienvenida requerido").max(500),
  addToCartConfirm: z.string().min(1).max(300),
  noStock: z.string().min(1).max(300),
  // ... resto de mensajes
});

export const playbookRulesSchema = z.object({
  askSizeBeforeCart: z.boolean(),
  askSkinTypeOnSearch: z.boolean(),
  autoSubstitutions: z.boolean(),
  upsellEnabled: z.boolean(),
  maxRecommendations: z.number().int().min(1).max(10),
});

export const llmPromptConfigSchema = z.object({
  tone: z.string().min(10, "Tono debe tener al menos 10 caracteres").max(1000),
  focusAreas: z.array(z.string()).min(1, "Al menos 1 área de enfoque"),
  commonQuestions: z.array(z.string()).min(1, "Al menos 1 pregunta común"),
  upsellStrategy: z.string().min(10).max(1000),
  emojiUsage: z.enum(['none', 'moderate', 'frequent']),
});

export const merchantProfileSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(100),
});
```

## Comportamiento

### Happy path

1. Merchant logueado navega `/dashboard/settings`
2. Loading skeleton muestra mientras `GET /merchants/me` carga
3. Form se hydrata con datos del backend:
   - Profile: name editable, industry "Retail General" (read-only badge)
   - Messages: todos los campos en accordion agrupado
   - Rules: toggles + input numérico
   - Guidelines: textareas + array inputs (chips)
4. Merchant edita N campos en cualquier sección
5. Form detecta dirty state → botón "Guardar cambios" habilitado + badge "Sin guardar"
6. Click "Guardar" → validación Zod client-side → si pasa:
   - Loading state en botón ("Guardando...")
   - `PATCH /merchants/me/playbook` con solo los campos modificados
7. Backend retorna 200 con config mergeado
8. TanStack Query actualiza cache → form refresca
9. Toast success: "✅ Configuración guardada"
10. Badge "Sin guardar" desaparece

### Edge cases

- **PlaybookConfig null (merchant nuevo):** mostrar defaults vacíos + prompt "Configura tu bot"
- **Session expirada:** middleware redirect `/login` antes de llegar a settings
- **Backend 400 (validación falla):** toast con mensaje error específico del backend
- **Backend 500:** toast genérico "Error al guardar, intenta de nuevo"
- **Network timeout:** TanStack Query retry 1 vez → si falla: toast error + mantener cambios
- **Merchant edita y navega sin guardar:** prompt browser "¿Salir sin guardar?" (via useEffect + beforeunload)
- **Campo array vacío (focusAreas=[]):** Zod validation bloquea (min 1 item)
- **Texto con placeholders inválidos:** client NO valida placeholders (eso es responsabilidad backend/validación semántica futura)

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Página `/dashboard/settings` renderiza con 4 tabs/accordions: Profile, Messages, Rules, Guidelines | manual: navegar y ver layout responsive (tabs desktop, accordion mobile) |
| AC-02 | Sección Profile muestra `name` editable + `industry` badge read-only "Retail General" | manual: verificar campo name input + badge geen "Retail General" |
| AC-03 | Sección Messages tiene TODOS los campos de `PlaybookMessages` (30+) agrupados por categoría | manual: expandir accordion y verificar campos presentes |
| AC-04 | Preview de placeholders: campos con `{variable}` → mostrar badge con preview ejemplo | manual: campo `greeting` con `{merchant_name}` → mostrar preview "Mi Tienda" |
| AC-05 | Sección Rules: 4 toggles + 1 input numérico (`maxRecommendations`) funcionan | manual: toggle ON/OFF persiste al guardar |
| AC-06 | Sección Guidelines: textarea `tone` + array inputs chips para `focusAreas` y `commonQuestions` | manual: agregar/remover chips funciona + textarea multiline |
| AC-07 | Al montar página → `GET /merchants/me` carga config → form se hydrata | test manual + Network DevTools: solicitud GET exitosa |
| AC-08 | Click "Guardar cambios" → `PATCH /merchants/me/playbook` con solo campos modificados | test manual + Network DevTools: body contiene solo lo editado |
| AC-09 | Backend retorna 200 → toast success "✅ Cambios guardados" | manual: guardar cambios válidos → ver toast verde |
| AC-10 | Validación client-side: campo vacío requerido → error inline + botón disabled | manual: borrar `greeting` → ver error rojo + botón "Guardar" disabled |
| AC-11 | Backend error 400/500 → toast error con mensaje | manual: forzar error (ej: backend down) → ver toast rojo |
| AC-12 | Click "Cancelar" → confirm dialog + reset form al estado backend | manual: editar campos → click "Cancelar" → form vuelve a estado original |

## Plan de pruebas

### Manual (AC-driven)

- **AC-01 a AC-06:** Navegación y verificación visual de todas las secciones
- **AC-07:** Abrir DevTools Network → ver request `GET /merchants/me` → form hydratado
- **AC-08 a AC-09:** Editar campos → click "Guardar" → ver request PATCH + toast success
- **AC-10:** Validación visual: borrar campo requerido → ver error inline
- **AC-11:** Simular error (backend down o 500) → ver toast error
- **AC-12:** Editar → cancelar → verificar reset

### Unit (opcional para MVP)

- Zod schemas validación (`playbook-config.schema.spec.ts`)
- Hook `usePlaybookConfig` mock fetch

### Integration (futura)

- Cypress/Playwright E2E: login → settings → editar → guardar → verificar persistencia

## DoD

- [ ] Todos los AC tienen evidencia (manual testing documentado)
- [ ] Sin scope creep (solo settings UI, sin wizard, sin FAQs editor)
- [ ] `pnpm --filter @closy-bot/dashboard dev` muestra página `/dashboard/settings` funcional
- [ ] `pnpm --filter @closy-bot/dashboard build` completa sin errores TypeScript
- [ ] `npx tsc --noEmit` en dashboard pasa (0 errores)
- [ ] Responsive: mobile (accordion) y desktop (tabs) funcionan correctamente
- [ ] Integración API: consume endpoints PR-15 correctamente (GET + PATCH)
- [ ] Validación client-side con Zod bloquea inputs inválidos
- [ ] Toast notifications para success/error funcionan
- [ ] Dirty state tracking: botón "Guardar" solo habilitado si hay cambios

## Constraints

- **No inventar campos:** respetar estructura `PlaybookConfig` exacta del backend (`playbook-config.interface.ts`)
- **Validación client-side básica:** tipos, requeridos, max lengths (no validación semántica compleja como URLs válidas)
- **No preview conversacional:** solo mostrar formulario editable, sin simulación de bot en vivo
- **Industry read-only:** MVP = "Retail General" fijo, no selector de industria
- **FAQs fuera de scope:** FAQs editor está en wizard step-customize (PR-FE-OB-2), no aquí

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Formulario muy largo (30+ campos Messages) → UX abrumadora | Agrupar en accordion por categorías (Bienvenida, Carrito, Búsqueda, etc.). Solo mostrar expanded la primera categoría. |
| Validación Zod desincronizada con backend | Usar tipos TypeScript compartidos (copiar interface desde backend). Validación server-side es la fuente de verdad. |
| TanStack Query cache stale → form muestra datos viejos | `staleTime: 5min` + invalidación explícita post-mutation (`queryClient.invalidateQueries(['merchant', 'me'])`). |
| Merchant navega sin guardar → pierde cambios | Hook `useBeforeUnload` + prompt browser "¿Salir sin guardar?". |
| PlaybookConfig null (merchant nuevo) → form crash | Default fallback: crear objeto vacío con estructura mínima + mensajes de ayuda "Configura tu bot". |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-26 | Brief DRAFT inicial | Usuario solicita PR-FE-05 en modo paralelo |

---

## Tech Notes (Planner)

### Estructura de tabs/accordion

**Desktop (≥768px):** Tabs horizontales con contenido a la derecha  
**Mobile (<768px):** Accordion vertical con secciones colapsables

### Agrupación de campos Messages (30+ campos)

Propuesta de accordion categories:

1. **Bienvenida y Ayuda** (5 campos)
   - greeting, helpMenu, unknownIntent, genericError, productNotFound
2. **Carrito** (10 campos)
   - addToCartConfirm, cartEmpty, cartSummaryHeader, cartSummaryFooter, removeConfirm, updateConfirm, quantityInvalid, itemNotInCart, cartEmptyNoAction, noStock
3. **Búsqueda y Catálogo** (5 campos)
   - searchNoResults, searchResultsHeader, searchResultsFooter, productMultipleOptions, variantMultipleOptions
4. **Checkout y Upsell** (2 campos)
   - checkoutStart, upsellTemplate
5. **Post-venta** (8+ campos)
   - orderStatusTemplate, orderStatusPendingPayment, orderStatusConfirmed, orderStatusPaid, orderStatusShipped, orderStatusDelivered, orderStatusCancelled, noOrderFound, ticketTypePrompt, ticketCreatedConfirm, ticketDescriptionPrompt

### Shadcn components necesarios

```bash
pnpm dlx shadcn-ui@latest add tabs
pnpm dlx shadcn-ui@latest add accordion
pnpm dlx shadcn-ui@latest add textarea
pnpm dlx shadcn-ui@latest add switch
pnpm dlx shadcn-ui@latest add badge
pnpm dlx shadcn-ui@latest add toast
pnpm dlx shadcn-ui@latest add command  # Para array chips input (focusAreas)
```

### TanStack Query patterns

```typescript
// hooks/use-playbook-config.ts
export const usePlaybookConfig = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant', 'me'],
    queryFn: () => apiClient.get<MerchantProfile>('/merchants/me'),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<PlaybookConfig>) =>
      apiClient.patch('/merchants/me/playbook', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant', 'me'] });
      toast({ title: '✅ Cambios guardados' });
    },
    onError: (error: Error) => {
      toast({ title: '❌ Error al guardar', description: error.message, variant: 'destructive' });
    },
  });

  return { data, isLoading, error, saveChanges: mutation.mutate };
};
```

### Form state management

- React Hook Form con `useForm` + Zod resolver
- `defaultValues` cargados desde TanStack Query data
- Dirty state tracking: `formState.isDirty` → habilitar botón "Guardar"
- `form.reset(originalData)` para botón "Cancelar"

### Responsive strategy

```tsx
// Desktop: Tabs
<Tabs defaultValue="profile" className="hidden md:flex">
  <TabsList className="flex-col">
    <TabsTrigger value="profile">Profile</TabsTrigger>
    <TabsTrigger value="messages">Messages</TabsTrigger>
    {/* ... */}
  </TabsList>
  <TabsContent value="profile">{/* ... */}</TabsContent>
</Tabs>

// Mobile: Accordion
<Accordion type="single" collapsible className="md:hidden">
  <AccordionItem value="profile">
    <AccordionTrigger>Profile</AccordionTrigger>
    <AccordionContent>{/* ... */}</AccordionContent>
  </AccordionItem>
  {/* ... */}
</Accordion>
```

### Placeholder preview

Para campos con placeholders como `{merchant_name}`, mostrar badge con ejemplo:

```tsx
<div className="space-y-2">
  <Label htmlFor="greeting">Mensaje de bienvenida</Label>
  <Textarea id="greeting" {...field} />
  <p className="text-sm text-muted-foreground">
    Placeholders disponibles: <Badge variant="secondary">{merchant_name}</Badge>
  </p>
  <p className="text-xs text-muted-foreground">
    Preview: "¡Hola! Soy tu asistente de <strong>Mi Tienda</strong>..."
  </p>
</div>
```
