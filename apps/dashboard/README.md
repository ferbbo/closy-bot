# Closy Bot Dashboard

Dashboard frontend para comerciantes usando Closy Bot - construido con Next.js 14 App Router.

## Stack Técnico

- **Framework**: Next.js 14.2.x (App Router)
- **UI Library**: shadcn/ui + Tailwind CSS 3.4
- **State Management**: TanStack Query v5 (server state)
- **Forms**: React Hook Form 7.x + Zod
- **Authentication**: Session-based via backend OAuth (PR-12)

## Prerequisitos

- Node.js >= 20.0.0
- pnpm >= 10.0.0
- Backend API corriendo en `http://localhost:3000` (ver `/apps/api`)

## Getting Started

### 1. Configurar variables de entorno

Copiar el archivo de ejemplo en el root del proyecto (ya configurado):

```bash
# El archivo .env.example del monorepo ya incluye:
NEXT_PUBLIC_API_URL=http://localhost:3000
```

O crear un archivo `.env.local` en `apps/dashboard/`:

```bash
cd apps/dashboard
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
```

### 2. Instalar dependencias

Desde el **root del monorepo**:

```bash
pnpm install
```

### 3. Ejecutar el servidor de desarrollo

Desde el **root del monorepo**:

```bash
# Opción 1: Usar script del root
pnpm dev:dashboard

# Opción 2: Ejecutar desde este directorio
cd apps/dashboard
pnpm dev
```

El dashboard estará disponible en [http://localhost:3001](http://localhost:3001).

### 4. Build para producción

```bash
# Desde el root
pnpm build:dashboard

# O desde apps/dashboard
cd apps/dashboard
pnpm build
```

## Estructura del Proyecto

```
apps/dashboard/
├── src/
│   ├── app/                   # App Router pages
│   │   ├── layout.tsx         # Root layout + Providers
│   │   ├── page.tsx           # Redirect a /dashboard
│   │   ├── login/             # Login page (OAuth buttons)
│   │   └── dashboard/         # Protected dashboard
│   │       ├── layout.tsx     # Sidebar + header
│   │       └── page.tsx       # Main dashboard view
│   ├── components/
│   │   ├── ui/                # shadcn components
│   │   └── providers.tsx      # TanStack Query provider
│   ├── hooks/
│   │   └── use-auth.ts        # Auth hook (TanStack Query)
│   └── lib/
│       ├── api.ts             # API client (fetch wrapper)
│       ├── query-client.ts    # TanStack Query config
│       └── utils.ts           # Utility functions (cn helper)
├── public/                    # Static assets
└── middleware.ts              # Auth middleware (protege rutas)
```

## Flujo de Autenticación

1. Usuario visita `/dashboard` sin cookie → **middleware redirect** → `/login`
2. Usuario hace clic en "Continuar con Google"
3. Frontend redirect → `{API_URL}/auth/login/google`
4. Backend maneja OAuth flow + crea sesión
5. Backend redirect → `/dashboard` con cookie `session_id`
6. Middleware verifica cookie via `GET /auth/me`
7. Dashboard muestra información del merchant

## Comandos Disponibles

Desde el root del monorepo:

```bash
pnpm dev:dashboard        # Dev server (puerto 3001)
pnpm build:dashboard      # Build producción
pnpm lint:dashboard       # Linter
```

Desde `apps/dashboard/`:

```bash
pnpm dev                  # Dev server
pnpm build                # Build
pnpm start                # Production server
pnpm lint                 # ESLint
```

## Configuración de Puerto

Por defecto usa puerto **3001** (configurado en `package.json`). Para cambiarlo:

```bash
# Editar apps/dashboard/package.json
"scripts": {
  "dev": "next dev --port 3002",  # Cambiar puerto aquí
  ...
}
```

## Troubleshooting

### Error: "API Error: 401"

- Verificar que el backend esté corriendo en `http://localhost:3000`
- Verificar variable `NEXT_PUBLIC_API_URL`
- Hacer logout y volver a autenticar

### Error: "fetch failed"

- Verificar CORS configurado en backend (PR-FE-00):
  ```env
  CORS_ORIGINS=http://localhost:3001
  ```

### Port 3001 ya en uso

```bash
# Encontrar proceso usando el puerto
lsof -ti:3001 | xargs kill -9

# O cambiar puerto (ver sección anterior)
```

## Dependencias de PRs

- ✅ **PR-12** (Auth OIDC): Backend OAuth necesario para login
- ✅ **PR-FE-00** (CORS): Backend debe permitir requests desde `localhost:3001`

## Referencias

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [TanStack Query](https://tanstack.com/query/latest)
- [Tailwind CSS](https://tailwindcss.com)
