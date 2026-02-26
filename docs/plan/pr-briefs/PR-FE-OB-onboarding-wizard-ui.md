# Brief — PR-FE-OB — Onboarding Wizard UI: Setup Step-by-Step

> **Status**: `APPROVED`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-OB-onboarding-wizard-ui.md`
> **Issue**: [#100](https://github.com/ferbbo/closy-bot/issues/100)
> **Parallel Mode**: `false` (default)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear wizard step-by-step en dashboard que guía al merchant durante setup inicial de su tienda, consumiendo API de PR-OB-01. Permite completar onboarding en ≤10 minutos cumpliendo la promesa MVP de "tienda lista rápido".

## Scope fence

### ✅ Included

- Página `/onboarding` con wizard de 5 steps:
  1. **Perfil:** Nombre negocio + seleccionar industria (ropa/belleza/minimarket)
  2. **Canal WhatsApp:** Conectar vía Meta Embedded Signup (PR-13)
  3. **Catálogo:** Subir CSV de productos (PR-17)
  4. **Pagos:** Configurar métodos de pago aceptados (PR-04.5)
  5. **Test:** Enviar mensaje de prueba + activar tienda
- Progress bar visual (% completado) usando `GET /onboarding/progress`
- Stepper component con indicadores: completado ✅ / activo 🔵 / pendiente ⚪
- Botón "Aplicar preset" en step 1 (aplica config default por industria)
- Botón "Activar tienda" en step 5 con validación de requisitos mínimos
- Navegación: "Siguiente" / "Anterior" entre steps
- Redirección: si merchant ya `status='active'` → redirect a `/dashboard`
- Middleware: si merchant `status='onboarding'` → redirect a `/onboarding` (excepto `/login`)
- Componentes shadcn nuevos: `stepper` (custom), `progress`, `badge`, `alert`
- Loading states y error handling en cada step
- Mobile-first responsive design

### ❌ Excluded

- Onboarding conversacional por WhatsApp (V1 solo dashboard)
- Gamification (badges, confetti, celebraciones)
- Preview de conversación bot en el wizard
- Tour guiado / tooltips interactivos
- Multi-idioma i18n (español hardcoded OK)
- Guardar progreso parcial en servidor (solo navegación cliente-side)
- Video tutorials / help center integrado
- Skip steps (todos obligatorios en orden)
- Editor avanzado de playbook dentro del wizard (usa preset simple)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Página `/onboarding` con stepper de 5 steps y progress bar | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-01, AC-02 |
| REQ-02 | Step 1 (Perfil): form nombre + selector industria + botón "Aplicar preset" | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-03, AC-04 |
| REQ-03 | Step 2 (Canal): botón "Conectar WhatsApp" → Meta Embedded Signup | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-05 |
| REQ-04 | Step 3 (Catálogo): drag & drop CSV upload con validación | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-06 |
| REQ-05 | Step 4 (Pagos): checkboxes métodos de pago (efectivo, transferencia, link) | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-07 |
| REQ-06 | Step 5 (Test): instrucciones test + botón "Activar tienda" con validación | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-08, AC-09 |
| REQ-07 | Middleware redirect: onboarding → `/onboarding`, active → `/dashboard` | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-10 |
| REQ-08 | Progress bar actualizado dinámicamente via `GET /onboarding/progress` | [#100](https://github.com/ferbbo/closy-bot/issues/100) | AC-11 |

## Paths a tocar (concretos)

### Nuevos

```
apps/dashboard/src/
  app/
    onboarding/
      page.tsx                          # NEW - Wizard container
      _components/
        stepper.tsx                     # NEW - Visual stepper component
        step-profile.tsx                # NEW - Step 1: Perfil
        step-channel.tsx                # NEW - Step 2: WhatsApp
        step-catalog.tsx                # NEW - Step 3: Catálogo
        step-payments.tsx               # NEW - Step 4: Pagos
        step-activate.tsx               # NEW - Step 5: Test + Activar
  components/
    ui/
      stepper.tsx                       # NEW - shadcn custom component
      progress.tsx                      # NEW - shadcn progress bar
      badge.tsx                         # NEW - shadcn badge for status
      alert.tsx                         # NEW - shadcn alert for errors/success
  hooks/
    use-onboarding.ts                   # NEW - TanStack Query hook for onboarding API
  lib/
    api.ts                              # UPDATE - add onboarding endpoints
```

### Modificados

```
apps/dashboard/src/
  middleware.ts                         # UPDATE - add onboarding redirect logic
  app/
    dashboard/
      layout.tsx                        # UPDATE - check merchant.status antes de render
```

## Contratos / Interfaces

### Consumer Experience (UI Flow)

#### Flujo happy path completo:

1. **Merchant login primera vez** → `merchant.status='onboarding'`
2. **Middleware redirect** → `/onboarding` automáticamente
3. **Step 1 - Perfil:**
   - Form pre-llenado con `merchant.name` y `merchant.email` (read-only)
   - Selector "Industria": Radio buttons (Ropa / Belleza / Minimarket)
   - Botón "Aplicar preset de [Industria]" → `POST /onboarding/apply-preset`
   - Success → stepper marca step 1 ✅ + avanza a step 2
4. **Step 2 - Canal WhatsApp:**
   - Botón grande "Conectar WhatsApp" → abre Meta Embedded Signup (PR-13)
   - Callback successful → progress recalcula → step 2 ✅
5. **Step 3 - Catálogo:**
   - Drag & drop zone para CSV
   - Upload → `POST /api/catalog/import-file` (PR-17)
   - Success → muestra stats (N productos importados) → step 3 ✅
6. **Step 4 - Pagos:**
   - Checkboxes: ☐ Efectivo / Pago contra entrega, ☐ Transferencia bancaria, ☐ Link de pago
   - Form para datos bancarios (opcional, si transferencia)
   - Guardar → `PATCH /merchants/me/config` (PR-04.5)
   - Success → step 4 ✅
7. **Step 5 - Test + Activar:**
   - Instrucciones: "Envía un mensaje de prueba a tu número WhatsApp"
   - Botón "Activar tienda" (disabled hasta que progress indique validación OK)
   - Click → `POST /onboarding/activate`
     - Success → redirect `/dashboard` con toast "¡Tienda activada!"
     - Error → alert con requisitos faltantes: "Falta: [channel, catalog]"

#### Navegación:
- Botones "Siguiente" / "Anterior" visibles en todos los steps (excepto "Anterior" en step 1)
- Step solo habilitado si el anterior está completado (no skip)
- Progress bar en header: `20% → 40% → 60% → 80% → 100%`

#### Error handling:
- API call falla → alert rojo con mensaje error + botón "Reintentar"
- Validación form falla → mensajes inline bajo campos (Zod + RHF)
- Activación falla por requisitos mínimos → alert con lista bullets de pendientes

### API Contracts (consumidos de PR-OB-01)

**GET /onboarding/progress**
```typescript
interface OnboardingProgress {
  completedSteps: ('profile' | 'channel' | 'catalog' | 'config' | 'test')[];
  pendingSteps: string[];
  percentage: number; // 0-100
  nextStep: string | null;
}
```

**POST /onboarding/apply-preset**
```typescript
// Request
{ industry: 'ropa' | 'belleza' | 'minimarket' }
// Response
{ success: true }
```

**POST /onboarding/activate**
```typescript
// Response success
{ activated: true, status: 'active' }
// Response error
{ error: 'Missing requirements', details: string[] }
```

### Component Structure (pseudo-code)

```tsx
// apps/dashboard/src/app/onboarding/page.tsx
'use client';
import { useOnboarding } from '@/hooks/use-onboarding';
import StepProfile from './_components/step-profile';
// ... otros steps

export default function OnboardingPage() {
  const { progress, applyPreset, activate } = useOnboarding();
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className="min-h-screen p-8">
      <Stepper current={currentStep} completed={progress.completedSteps} />
      <Progress value={progress.percentage} />
      
      {currentStep === 1 && <StepProfile onNext={() => setCurrentStep(2)} />}
      {currentStep === 2 && <StepChannel onNext={...} onBack={...} />}
      {/* ... otros steps */}
    </div>
  );
}
```

### Stepper Visual Design (descriptivo)

```
Step 1          Step 2         Step 3         Step 4         Step 5
  ✅ ————————————  🔵 ————————————  ⚪ ————————————  ⚪ ————————————  ⚪
Perfil         Canal        Catálogo        Pagos         Activar

[=====               40%                      ]
```

- **Completado ✅**: green checkmark + line solid green
- **Activo 🔵**: blue circle + line gray
- **Pendiente ⚪**: gray circle + line gray dashed

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Página `/onboarding` renderiza wizard con 5 steps y navegación | Screenshot: stepper visible con todos los steps |
| AC-02 | Progress bar actualizado en cada step completado (20%, 40%, 60%, 80%, 100%) | Screenshot: progress bar en 60% tras completar step 3 |
| AC-03 | Step 1 muestra form perfil con selector industria + botón preset | Screenshot: form con radio buttons de industrias |
| AC-04 | Botón "Aplicar preset" llama `POST /onboarding/apply-preset` y actualiza progress | Test e2e: click preset → network request → step 1 marcado completado |
| AC-05 | Step 2 botón "Conectar WhatsApp" abre Meta Embedded Signup (PR-13 integration) | Test manual: click botón → popup Meta visible |
| AC-06 | Step 3 drag & drop CSV funcional, upload exitoso marca step completado | Test e2e: upload CSV → import stats visible → progress +20% |
| AC-07 | Step 4 form métodos de pago guarda vía `PATCH /merchants/me/config` | Test e2e: seleccionar métodos → guardar → progress +20% |
| AC-08 | Step 5 botón "Activar tienda" llama `POST /onboarding/activate` | Test e2e: click activar → network request correcto |
| AC-09 | Activación exitosa redirige a `/dashboard` con toast success | Test e2e: activación OK → URL = `/dashboard` + toast visible |
| AC-10 | Middleware redirige merchant onboarding a `/onboarding`, active a `/dashboard` | Test e2e: merchant onboarding navega a `/dashboard` → redirect a `/onboarding` |
| AC-11 | Progress bar refleja estado real via `GET /onboarding/progress` (polling cada 10s) | Test: simular step completado en backend → frontend actualiza progress sin refresh |

## Plan de pruebas

### Unit tests (componentes individuales)

- `StepProfile`: form submit llama `applyPreset` con industry correcta
- `StepChannel`: botón click abre URL Meta Embedded Signup
- `StepCatalog`: file upload validation (solo .csv, max 5MB)
- `StepPayments`: form validation (mínimo 1 método seleccionado)
- `StepActivate`: botón disabled hasta validación OK
- `Stepper`: renderiza steps correctamente según estado (completado/activo/pendiente)

### Integration (e2e - manual o Playwright futuro)

**Scenario 1: Happy path completo**
```typescript
test('merchant completa onboarding en 5 steps', async () => {
  // 1. Login → redirect /onboarding
  // 2. Step 1: seleccionar industria → aplicar preset → step completado
  // 3. Step 2: conectar WhatsApp (mock) → step completado
  // 4. Step 3: upload CSV (mock) → step completado
  // 5. Step 4: configurar pagos → step completado
  // 6. Step 5: activar tienda → redirect /dashboard
  // 7. Verify: merchant.status = 'active'
});
```

**Scenario 2: Activación falla por requisitos faltantes**
```typescript
test('activar sin catalog muestra error', async () => {
  // 1. Setup: merchant con solo profile + channel (skip catalog)
  // 2. Step 5: click "Activar tienda"
  // 3. Verify: alert error visible con "Falta: catalog, config"
  // 4. Verify: no redirect, merchant sigue en onboarding
});
```

**Scenario 3: Progress bar actualizado dinámicamente**
```typescript
test('progress bar refleja estado backend', async () => {
  // 1. Initial: progress = 20% (solo profile)
  // 2. Completar step 2 (channel) → progress = 40%
  // 3. Completar step 3 (catalog) → progress = 60%
  // 4. Verify: progress bar visual match porcentaje
});
```

### Manual testing checklist

- [ ] Wizard navegable con mouse y teclado (accesibilidad básica)
- [ ] Responsive: funciona en mobile (360px width) y desktop (1920px)
- [ ] Loading states visibles durante API calls (spinners/skeletons)
- [ ] Error alerts se pueden cerrar (botón X o auto-dismiss tras 5s)
- [ ] Toast success aparece y desaparece correctamente
- [ ] Back button browser funciona (cada step es URL state o usa history.pushState)

## DoD

- [ ] Todos los AC tienen evidencia (screenshots + test names)
- [ ] Sin scope creep (solo lo del brief)
- [ ] Progress bar sincronizado con backend (`GET /onboarding/progress`)
- [ ] Middleware redirect implementado y testeado
- [ ] Mobile-first responsive (testado en 360px, 768px, 1920px)
- [ ] Loading states y error handling en todos los API calls
- [ ] `pnpm lint` y `pnpm build` pasan sin errores
- [ ] **API Consumer-First:**
  - [ ] Todos los endpoints consumidos documentados en código (tipos + comments)
  - [ ] Error responses del backend manejados con UX claro (alerts accionables)
  - [ ] Auth cookie forwarding funciona (`credentials: 'include'` en API calls)
  - [ ] Network errors (timeout, 500) tienen retry logic o mensaje claro

## Consumer experience

**From merchant perspective:**
1. **Inicio rápido:** Login → wizard aparece automáticamente (no buscar dónde configurar)
2. **Guía clara:** Cada step explica qué hacer + por qué es necesario
3. **Feedback inmediato:** Progress bar motivacional + checkmarks verdes al completar
4. **Presets aceleran:** Aplicar preset de industria pre-configura 80% del setup
5. **Validación clara:** Si falta algo para activar, lista específica de pendientes (no error genérico)
6. **Tiempo real:** Completa en ≤10 minutos sin salir del wizard

**From developer perspective:**
- Componentes reutilizables (Stepper puede usarse en otros flujos)
- TanStack Query maneja cache y polling automáticamente
- Tipos TypeScript para todos los payloads (seguridad compile-time)
- Error boundaries previenen crashes en steps individuales

## Constraints

- **No guardar progreso parcial:** Wizard es client-side state, no persiste step actual en servidor (V1 simplificación)
- **No skip steps:** Todos obligatorios en orden (UX opinionated para garantizar setup completo)
- **No multi-idioma:** Español hardcoded en copy (i18n en V2)
- **No LLM:** Este módulo NO usa LLM (UI pura consumiendo REST API)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Meta Embedded Signup popup bloqueado por browser | Media | Alto | Instrucciones claras + enlace alternativo si popup falla |
| CSV upload timeout en conexión lenta | Media | Medio | Mostrar progress bar de upload + timeout 60s |
| Merchant cierra tab durante setup | Alta | Bajo | OK, puede retomar (progress en servidor persiste vía API) |
| Botón "Activar" clickeado múltiples veces | Media | Bajo | Disabled durante API call + loading spinner |
| API /onboarding/progress lenta (N+1 queries) | Baja | Medio | Polling cada 10s (no cada render) + staleTime 5s en TanStack Query |

## Tech notes

- **Stepper component:** Custom implementation (no existe en shadcn standard). Inspirar en [shadcn-extension stepper](https://github.com/sadmann7/shadcn-ui-expansions) o implementar custom con Tailwind.
- **Polling progress:** TanStack Query `refetchInterval: 10000` (10s) solo cuando wizard está abierto.
- **Step state:** Mantener `currentStep` en useState, derivar "can proceed" from `progress.completedSteps`.
- **Meta Embedded Signup:** Abrir en popup via `window.open()` con dimensiones específicas (PR-13 ya implementó backend callback).
- **CSV Upload:** Reusa componente de PR-17 catalog import (si existe en frontend, sino implementar drag & drop con `react-dropzone` o nativo).
- **Middleware redirect logic:**
  ```typescript
  // middleware.ts
  if (pathname !== '/login' && pathname !== '/onboarding') {
    const merchant = await fetchMerchant(); // via /auth/me
    if (merchant.status === 'onboarding') {
      return NextResponse.redirect('/onboarding');
    }
  }
  if (pathname === '/onboarding') {
    const merchant = await fetchMerchant();
    if (merchant.status === 'active') {
      return NextResponse.redirect('/dashboard');
    }
  }
  ```

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| — | — | — |
