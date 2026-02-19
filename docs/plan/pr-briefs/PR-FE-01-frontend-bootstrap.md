# Brief — PR-FE-01 — Frontend Bootstrap: Next.js + shadcn + TanStack Query

> **Status**: `AMENDED`
> **Archivo**: `docs/plan/pr-briefs/PR-FE-01-frontend-bootstrap.md`
> **Issue**: [#67](https://github.com/ferbbo/closy-bot/issues/67)
> **SCR**: [#69](https://github.com/ferbbo/closy-bot/issues/69)
> **Regla**: Max 2 páginas. Spec-locked. Sin scope extra.

## Objetivo

Crear el package frontend `@closy-bot/dashboard` con stack mínimo (Next.js 14 App Router + shadcn/ui + TanStack Query) y primera funcionalidad: login OAuth redirect + dashboard protegido mostrando merchant info desde backend (PR-12). Habilita desarrollo de UI para todos los flujos del MVP V1.

## Scope fence

### ✅ Included

- Package `@closy-bot/dashboard` en `apps/dashboard/`
- Next.js 14.3.x con App Router + TypeScript 5.x
- Tailwind CSS 3.4 + shadcn/ui CLI init + componentes: Button, Card, Form, Input
- TanStack Query v5 con QueryClientProvider configurado
- React Hook Form 7.x + Zod para validaciones
- Middleware auth: verifica cookie via `GET /auth/me`, redirect `/login` si 401
- Layout base con sidebar placeholder (responsive mobile-first)
- Página `/login`: botones "Google" y "Microsoft" → redirect `{API_URL}/auth/login/:provider`
- Página `/dashboard`: protegida, muestra `merchant.name`, `merchant.email`, `merchant.industry` desde `/auth/me`
- API client base (`lib/api.ts`) con `fetch` + `credentials: 'include'`
- Hook `useAuth()` con TanStack Query para `/auth/me` (staleTime: 5min)
- Scripts root: `dev:dashboard`, `build:dashboard`, `lint:dashboard`
- `.env.example` con `NEXT_PUBLIC_API_URL`
- Actualización `pnpm-workspace.yaml` para incluir `apps/dashboard`

### ❌ Excluded

- Auth.js/NextAuth (usa backend OAuth existente de PR-12)
- Zustand (TanStack Query maneja server state)
- OpenAPI client generator (PR-FE-02)
- BFF route handlers complejos (API routes Next.js)
- UI funcional de channels/catalog/playbook (PRs posteriores)
- Tests E2E con Playwright (manual testing OK para MVP)
- Animaciones avanzadas / motion libraries
- Internacionalización i18n (español hardcoded OK)

## Requisitos numerados

| ID | Requisito | Issue | AC |
|--------|-----------|-------|------|
| REQ-01 | Crear package `apps/dashboard/` con Next.js 14 + TypeScript 5.x + App Router | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-01, AC-02 |
| REQ-02 | Configurar Tailwind CSS 3.4 + shadcn/ui (init + Button, Card, Form, Input) | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-03, AC-04 |
| REQ-03 | Configurar TanStack Query v5 + React Hook Form + Zod | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-05, AC-06 |
| REQ-04 | Implementar API client base (`lib/api.ts`) con cookie forwarding | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-07 |
| REQ-05 | Implementar middleware auth (verifica `/auth/me`, redirect `/login` si 401) | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-08, AC-09 |
| REQ-06 | Crear página `/login` con botones OAuth redirect | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-10 |
| REQ-07 | Crear página `/dashboard` protegida mostrando merchant info | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-11, AC-12 |
| REQ-08 | Actualizar workspace: `pnpm-workspace.yaml`, root `package.json` scripts | [#67](https://github.com/ferbbo/closy-bot/issues/67) | AC-13, AC-14 |

> **Nota**: Todos los REQs apuntarán al mismo issue (creado post-BRIEF GATE).

## Paths a tocar (concretos)

### Nuevos (estructura completa)

```
apps/dashboard/
├── package.json (name: @closy-bot/dashboard, version: 0.1.0)
├── tsconfig.json (extends root tsconfig.base.json)
├── next.config.js (reactStrictMode: true)
├── tailwind.config.ts (with shadcn preset)
├── postcss.config.js
├── .env.example (NEXT_PUBLIC_API_URL)
├── src/
│   ├── app/
│   │   ├── layout.tsx (root layout con QueryClientProvider)
│   │   ├── page.tsx (redirect a /dashboard)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx (sidebar + header)
│   │       └── page.tsx
│   ├── components/
│   │   └── ui/ (shadcn components: button, card, form, input)
│   ├── lib/
│   │   ├── api.ts (API client base con fetch)
│   │   └── utils.ts (cn helper de shadcn)
│   ├── hooks/
│   │   └── useAuth.ts (TanStack Query hook para /auth/me)
│   └── middleware.ts (auth check + redirect)
└── public/ (favicon placeholder)
```

### Modificados

- `pnpm-workspace.yaml` — agregar `apps/dashboard`
- `package.json` (root) — agregar scripts `dev:dashboard`, `build:dashboard`, `lint:dashboard`
- `.env.example` (root) — agregar sección Frontend con `NEXT_PUBLIC_API_URL`

## Contratos / Interfaces

### Consumer Experience (API Consumer-First)

#### Escenario 1: Dev startup

```bash
# Terminal 1: Backend
pnpm dev

# Terminal 2: Frontend (nuevo script)
pnpm dev:dashboard

# Browser: http://localhost:3001 → redirect a /dashboard
# Si no autenticado → middleware redirect a /login
```

#### Escenario 2: Login flow (usuario)

1. Browser → `http://localhost:3001/login`
2. User click botón "Google"
3. Frontend redirect → `http://localhost:3000/auth/login/google`
4. Backend redirige a Google OAuth
5. Google callback → backend `/auth/callback/google`
6. Backend sets cookie `session_id` + redirect → `http://localhost:3001/dashboard`
7. Frontend middleware verifica cookie via `GET /auth/me` → 200 OK
8. Dashboard muestra: "Hola, Juan Pérez (juan@ejemplo.com) - Industria: Ropa"

#### Escenario 3: Protected route sin auth

1. Browser → `http://localhost:3001/dashboard` (sin cookie)
2. Middleware ejecuta: `fetch('http://localhost:3000/auth/me', { credentials: 'include' })` → 401
3. Middleware redirect → `/login`

### API client (`lib/api.ts`)

```typescript
// apps/dashboard/src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      credentials: 'include', // ← Envía cookie session_id
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
  // post, patch, delete similar...
};
```

### Hook `useAuth()` (TanStack Query)

```typescript
// apps/dashboard/src/hooks/useAuth.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface AuthResponse {
  merchant: {
    id: string;
    name: string;
    email: string;
    industry: string;
  };
}

export const useAuth = () => {
  return useQuery<AuthResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<AuthResponse>('/auth/me'),
    staleTime: 5 * 60 * 1000, // 5min - reduce requests repetidos
    retry: false, // No reintentar si 401
  });
};
```

### Middleware auth (`middleware.ts`)

```typescript
// apps/dashboard/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip checking para /login y static assets
  if (pathname.startsWith('/login') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  // Verificar auth via backend
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const cookie = request.cookies.get('session_id');
    
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: cookie ? { Cookie: `session_id=${cookie.value}` } : {},
    });

    if (!res.ok) {
      // Redirect a login si 401
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/channels/:path*', '/catalog/:path*'],
};
```

### Env vars (dashboard)

```.env
# apps/dashboard/.env.example
NEXT_PUBLIC_API_URL=http://localhost:3000
```

```.env
# Root .env.example (actualizar sección)
# ===== Frontend =====
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Comportamiento

### Happy path

1. **Instalación:**
   - `pnpm install` en root → instala dependencias de todos los workspaces
   - `pnpm dlx shadcn-ui@latest init` en `apps/dashboard/` (primera vez)
   - `pnpm dlx shadcn-ui@latest add button card form input` → instala componentes
2. **Dev:**
   - `pnpm dev:dashboard` → arranca Next.js en puerto 3001
   - Hot reload funcional
3. **Login:**
   - User visita `/dashboard` sin auth → redirect `/login`
   - Click "Google" → redirect backend OAuth → callback → redirect `/dashboard` con cookie
   - Dashboard muestra merchant info desde `useAuth()` hook
4. **Build:**
   - `pnpm build:dashboard` → `next build` completa sin errores TypeScript
   - Output: `.next/` con static/SSR bundles

### Edge cases

- **Backend no disponible (dev):** middleware catch → redirect `/login` (evita crash)
- **Cookie expirada:** `/auth/me` retorna 401 → middleware redirect `/login`
- **CORS no configurado:** browser bloquea requests → depende de PR-FE-00 MERGED
- **Port 3001 ocupado:** Next.js error → documenta en README (manual change port)
- **Env var faltante:** `NEXT_PUBLIC_API_URL` undefined → fallback `http://localhost:3000`

## Acceptance Criteria (verificables)

| ID | Criterio | Evidencia |
|--------|----------|-----------|
| AC-01 | Package `@closy-bot/dashboard` existe con Next.js 14 + TypeScript | manual: `ls apps/dashboard/package.json` y verificar deps |
| AC-02 | `pnpm --filter @closy-bot/dashboard dev` arranca en puerto 3001 | manual: ejecutar comando + verificar `http://localhost:3001` responde |
| AC-03 | Tailwind CSS configurado y funcional (clases aplicadas) | manual: inspeccionar DOM, ver clases Tailwind en elementos |
| AC-04 | shadcn/ui componentes instalados (Button, Card, Form, Input) | manual: `ls apps/dashboard/src/components/ui/` muestra archivos |
| AC-05 | TanStack Query provider configurado en root layout | manual: verificar `apps/dashboard/src/app/layout.tsx` contiene `<QueryClientProvider>` |
| AC-06 | React Hook Form + Zod configurados (package.json) | manual: `cat apps/dashboard/package.json` muestra deps |
| AC-07 | API client `lib/api.ts` implementado con `credentials: 'include'` | manual: verificar código `apps/dashboard/src/lib/api.ts` |
| AC-08 | Middleware auth verifica cookie via `/auth/me` | manual: verificar `apps/dashboard/src/middleware.ts` hace fetch a `/auth/me` |
| AC-09 | Middleware redirige a `/login` si `/auth/me` retorna 401 | manual: browser sin cookie → `/dashboard` → redirect `/login` |
| AC-10 | Página `/login` tiene botones "Google" y "Microsoft" funcionales | manual: click botón → redirect `localhost:3000/auth/login/google` |
| AC-11 | Página `/dashboard` protegida (solo accesible con auth) | manual: sin cookie → redirect; con cookie → muestra contenido |
| AC-12 | Dashboard muestra `merchant.name`, `merchant.email` | manual: login → dashboard muestra datos correctos desde `useAuth()` |
| AC-13 | `pnpm-workspace.yaml` actualizado con `apps/dashboard` | manual: verificar archivo contiene `apps/dashboard` |
| AC-14 | Root `package.json` tiene scripts `dev:dashboard`, `build:dashboard`, `lint:dashboard` | manual: `pnpm dev:dashboard` funciona desde root |

## Plan de pruebas

### Manual (AC-driven)

- **AC-02:** Ejecutar `pnpm dev:dashboard`, verificar puerto 3001 abierto
- **AC-09:** Browser sin cookie → navegar `/dashboard` → verificar redirect `/login`
- **AC-10:** Click botón "Google" → verificar redirect backend correcta (URL y query params)
- **AC-11:** Con cookie válida → navegar `/dashboard` → verificar NO redirect
- **AC-12:** Login end-to-end → verificar datos merchant visibles en dashboard

### Unit (opcional para MVP)

- `lib/api.ts` helper functions
- TanStack Query hooks (mock fetch)

### E2E (fuera de scope V1)

- Playwright tests (PR-FE-06 o posterior)

## DoD

- [ ] Todos los AC tienen evidencia (manual testing documentado)
- [ ] Sin scope creep (solo lo del brief)
- [ ] `pnpm --filter @closy-bot/dashboard dev` arranca sin errores
- [ ] `pnpm --filter @closy-bot/dashboard build` completa sin errores TypeScript
- [ ] TypeScript type checking pasa (via build)
- [ ] Login flow funciona con backend local (manual navigation workaround para port redirect)
- [ ] Dashboard muestra merchant info correctamente (GET `/auth/me`)
- [ ] Middleware auth funcional (redirect `/login` si 401)
- [ ] Responsive básico funcional (mobile-first, testear en DevTools mobile view)
- [ ] `.env.example` actualizado con `NEXT_PUBLIC_API_URL`
- [ ] `pnpm-workspace.yaml` actualizado
- [ ] Root `package.json` scripts agregados
- [ ] shadcn components instalados y funcionando (Button, Card, Form, Input)
- [ ] README.md de `apps/dashboard/` creado con setup instructions

## Constraints

### Dependencias

- **PR-12 (Auth OIDC):** ✅ MERGED — backend `/auth/me` disponible
- **PR-FE-00 (CORS):** En PR #66, requiere MERGE antes de testing end-to-end (sin CORS, browser bloquea requests)

### Stack decisions

- **NO usar Auth.js/NextAuth:** backend maneja OAuth, frontend solo valida cookie
- **NO usar Zustand:** TanStack Query suficiente para server state
- **TailwindCSS mobile-first:** `sm:`, `md:`, `lg:` breakpoints estándar

### Estándar de código

- TypeScript strict mode habilitado
- ESLint Next.js config (extends `next/core-web-vitals`)
- Prettier integrado (si existe en root)
- Path aliases: `@/` apunta a `src/` (tsconfig.json)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| PR-FE-00 no mergeado a tiempo | Media | Alto | Documentar dependencia; testing local puede hacerse con CORS wildcard temporal |
| Port 3001 conflicto en dev | Baja | Bajo | Documentar en README cómo cambiar puerto (`next dev -p 3002`) |
| Cookie no se envía (SameSite issues) | Media | Alto | Backend ya configura `SameSite: Lax` (PR-12); verificar en DevTools |
| Middleware agrega latencia | Baja | Medio | Cache con staleTime en TanStack Query (5min); considerar memoización en PRs futuros |

## Spec Change Log

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2026-02-19 | AC-12: Removido `merchant.industry` | Backend PR-12 no expone industry field; MVP V1 no lo requiere (SCR #69) |
| 2026-02-19 | DoD: Cambiado "pnpm lint:dashboard pasa" → "TypeScript type checking pasa (via build)" | TSConfig monorepo conflict; build type check suficiente para MVP (SCR #69) |
| 2026-02-19 | DoD: Cambiado "Login redirect end-to-end" → "Login flow con workaround" | Backend redirige a puerto 3000; requiere manual navigation; fix en PR-FE-02 (SCR #69) |
