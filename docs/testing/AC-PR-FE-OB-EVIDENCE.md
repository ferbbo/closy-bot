# AC Evidence — PR-FE-OB — Onboarding Wizard UI

> **Branch**: PR-FE-OB-onboarding-wizard-ui  
> **Date**: 2026-02-25  
> **Status**: COMPLETE

---

## AC-01 — Página /onboarding renderiza wizard con 5 steps y navegación

**Evidencia**: `apps/dashboard/src/app/onboarding/page.tsx`  
- `useState(1)` maneja el step actual.
- `ONBOARDING_STEPS` (array de 5 elementos) controla el stepper.
- Componente `<Stepper currentStep={currentStep} completedSteps={completedSteps} />` renderiza los 5 steps.
- Build output: `○ /onboarding — 50.2 kB` compilado sin errores.

---

## AC-02 — Progress bar actualizado en cada step completado (20%, 40%, 60%, 80%, 100%)

**Evidencia**: `apps/dashboard/src/app/onboarding/page.tsx` + `components/ui/progress.tsx`  
- `progress.percentage` viene del backend vía `useOnboardingProgress()`.
- `<Progress value={percentage} />` con transición CSS `duration-500`.
- Texto `{percentage}%` renderizado junto a la barra.

---

## AC-03 — Step 1 muestra form perfil con selector industria + botón preset

**Evidencia**: `apps/dashboard/src/app/onboarding/_components/step-profile.tsx`  
- `react-hook-form` + `zod` validan campo `industry`.
- Tres radio buttons: `ropa`, `belleza`, `minimarket` con label y descripción.
- Botón "Aplicar preset de industria" (`type="submit"`).
- Datos de negocio (name, email) renderizados read-only.

---

## AC-04 — Botón "Aplicar preset" llama POST /onboarding/apply-preset y actualiza progress

**Evidencia**: 
- `apps/dashboard/src/app/onboarding/_components/step-profile.tsx` — `handleSubmit → applyPreset.mutateAsync({ industry })`
- `apps/dashboard/src/hooks/use-onboarding.ts` → `useApplyPreset()` → `api.applyPreset()` → `POST /onboarding/apply-preset`
- `onSuccess`: `queryClient.invalidateQueries({ queryKey: ONBOARDING_KEYS.progress })` actualiza el progress bar

---

## AC-05 — Step 2 botón "Conectar WhatsApp" abre Meta Embedded Signup

**Evidencia**: `apps/dashboard/src/app/onboarding/_components/step-channel.tsx`  
- `window.open(signupUrl, 'meta_embedded_signup', 'width=600,height=700,...')`
- `signupUrl` = `${NEXT_PUBLIC_API_URL}/channels/meta/embedded-signup`
- Popup bloqueado → Alert component (NO window.alert).
- Feedback visual: spinner "Esperando conexión con Meta…" mientras popup abierto.

---

## AC-06 — Step 3 drag & drop CSV funcional, upload exitoso marca step completado

**Evidencia**: `apps/dashboard/src/app/onboarding/_components/step-catalog.tsx`  
- `onDrop` / `onChange` validan: extensión `.csv` + tamaño ≤ 5MB.
- Errores de validación con mensajes inline.
- `useImportCatalog()` → `api.importCatalogFile(formData)` → `POST /catalog/import-file` (multipart, NO JSON).
- `onSuccess`: stats `{ imported, errors }` se muestran + `invalidateQueries` actualiza progress.

---

## AC-07 — Step 4 form métodos de pago guarda vía PATCH /merchants/me/config

**Evidencia**: `apps/dashboard/src/app/onboarding/_components/step-payments.tsx`  
- Checkboxes: `acceptsCash`, `acceptsTransfer`, `acceptsPaymentLink`.
- Zod: mínimo 1 método requerido.
- Campos bancarios condicionales (solo si `acceptsTransfer=true`).
- `useSavePaymentConfig()` → `api.savePaymentConfig(data)` → `PATCH /merchants/me/config`.
- `onSuccess`: `invalidateQueries` actualiza progress.

---

## AC-08 — Step 5 botón "Activar tienda" llama POST /onboarding/activate

**Evidencia**: `apps/dashboard/src/app/onboarding/_components/step-activate.tsx`  
- Checklist visual con `STEP_LABELS` para los 4 requisitos.
- Botón disabled si `missingSteps.length > 0 || activateMutation.isPending`.
- `useActivateMerchant()` → `api.activateMerchant()` → `POST /onboarding/activate`.

---

## AC-09 — Activación exitosa redirige a /dashboard con toast success

**Evidencia**: `apps/dashboard/src/app/onboarding/_components/step-activate.tsx`  
```tsx
await activateMutation.mutateAsync();
toast.success('¡Tienda activada!', {
  description: 'Tu tienda está lista para recibir pedidos por WhatsApp.',
});
router.replace('/dashboard');
```
- `sonner` instalado (`^2.0.7`).
- `<Toaster richColors position="top-right" />` en `components/providers.tsx`.
- `toast.success()` se llama ANTES de `router.replace()`.

---

## AC-10 — Middleware redirige merchant onboarding → /onboarding, active → /dashboard

**Evidencia**: `apps/dashboard/src/middleware.ts`  
```typescript
if (status === 'onboarding' && pathname !== '/onboarding') {
  return NextResponse.redirect(new URL('/onboarding', request.url));
}
if (status === 'active' && pathname === '/onboarding') {
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```
- Capa adicional en `apps/dashboard/src/app/dashboard/layout.tsx`:
```tsx
useEffect(() => {
  if (merchant && merchant.status === 'onboarding') {
    router.replace('/onboarding');
  }
}, [merchant, router]);
```

---

## AC-11 — Progress bar refleja estado real via GET /onboarding/progress (polling cada 10s)

**Evidencia**: `apps/dashboard/src/hooks/use-onboarding.ts`  
```typescript
useQuery<OnboardingProgress>({
  queryKey: ONBOARDING_KEYS.progress,
  queryFn: api.getOnboardingProgress,
  refetchInterval: 10_000,  // 10 segundos
  staleTime: 5_000,
  retry: 2,
});
```

---

## Build + Quality Gates

```
✅ npx tsc --noEmit   → 0 errors
✅ pnpm lint          → No ESLint warnings or errors
✅ pnpm build         → Compiled successfully (8/8 static pages)
   /onboarding route  → 50.2 kB (compiled)
```
