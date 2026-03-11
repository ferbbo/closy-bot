# Cloudflare R2 Setup Guide

**Tiempo estimado:** < 30 minutos  
**Prerrequisito de:** PR-18 (Product Images API)  
**Variables declaradas en:** `apps/api/.env.example` + `apps/api/src/common/config/env.validation.ts`

---

## Prerequisitos

- Cuenta de Cloudflare activa ([dash.cloudflare.com](https://dash.cloudflare.com))
- Acceso a la sección **R2 Object Storage** (puede requerir agregar tarjeta de crédito, aunque el free tier es amplio: 10 GB/mes storage, 1M operaciones Class A, 10M operaciones Class B)

---

## 1. Crear Bucket R2

1. En el dashboard de Cloudflare, ir a **R2 Object Storage → Create bucket**
2. Ingresar un nombre de bucket (ej: `closy-bot-products`)
   - Los nombres son globales dentro de tu cuenta; usa un prefijo distintivo
3. Seleccionar región: **Automatic** (recomendado para latencia global óptima)
4. Hacer click en **Create bucket**

> **Importante:** El bucket se crea como **privado por defecto**. El acceso público se configura en el Paso 3.

---

## 2. Generar API Credentials (Access Key + Secret)

1. En el dashboard de R2, ir a **Overview → Manage R2 API tokens**
2. Hacer click en **Create API token**
3. Configurar:
   - **Token name:** `closy-bot-api-prod` (o `closy-bot-api-dev` para desarrollo)
   - **Permissions:** `Object Read & Write`
   - **Specify bucket(s):** seleccionar el bucket creado en el Paso 1
   - **TTL:** sin expiración (o 1 año, según política de seguridad del equipo)
4. Hacer click en **Create API token**
5. **Guardar inmediatamente** los valores mostrados (no se vuelven a mostrar):
   - `Access Key ID` → variable `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → variable `R2_SECRET_ACCESS_KEY`
6. Anotar también tu **Account ID** (visible en el sidebar derecho del dashboard):
   - → variable `R2_ACCOUNT_ID`

El endpoint S3-compatible de tu bucket es:  
```
https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com
```

---

## 3. Configurar Public Access / CDN

### Opción A: R2.dev subdomain (más rápido, < 5 min)

1. En tu bucket, ir a **Settings → Public Access**
2. En la sección **R2.dev subdomain**, hacer click en **Enable**
3. Confirmar. Recibirás una URL como:
   ```
   https://pub-abc123def456.r2.dev
   ```
4. Copiar esta URL → variable `R2_PUBLIC_URL`

### Opción B: Custom Domain (recomendado para producción)

Para usar `cdn.closy.bot`:

1. En tu bucket, ir a **Settings → Custom Domains → Connect Domain**
2. Ingresar `cdn.closy.bot` (o el subdominio deseado)
3. Cloudflare agregará automáticamente el registro DNS (si el dominio ya está en Cloudflare)
4. Esperar propagación DNS (generalmente < 2 minutos si el dominio está en Cloudflare)
5. La URL pública queda como:
   ```
   https://cdn.closy.bot
   ```
6. Copiar esta URL → variable `R2_PUBLIC_URL`

> **Nota:** El custom domain solo funciona si el dominio está gestionado por Cloudflare (registrador o nameservers delegados a Cloudflare).

---

## 4. Configurar CORS

> Necesario para que el dashboard (`localhost:3001` en desarrollo) pueda hacer uploads directos al bucket.

1. En tu bucket, ir a **Settings → CORS Policy**
2. Hacer click en **Add CORS Policy** y pegar la siguiente configuración:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3001",
      "https://dashboard.closy.bot"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Hacer click en **Save**

> **`localhost:3001` es obligatorio** para que el frontend de desarrollo pueda subir imágenes sin CORS error.

---

## 5. CDN Custom Domain (detalle adicional)

Si usas custom domain, verifica que el comportamiento de caché sea el correcto:

- En **Cloudflare → tu dominio → Rules → Cache Rules**, puedes ajustar TTL de caché para `cdn.closy.bot/*`
- Recomendado para imágenes de productos: TTL de **1 día** a **1 semana** (las URLs incluyen hash al cambiar imagen)
- Para invalidar caché de forma puntual: usar **Cloudflare → Caching → Custom Purge**

---

## 6. Variables de entorno

Copiar y pegar en tu `.env` local (basado en `apps/api/.env.example`):

```bash
# Cloudflare R2
R2_ACCOUNT_ID=tu_account_id_aqui
R2_ACCESS_KEY_ID=tu_access_key_id_aqui
R2_SECRET_ACCESS_KEY=tu_secret_key_aqui
R2_BUCKET_NAME=closy-bot-products
R2_PUBLIC_URL=https://pub-abc123.r2.dev   # o https://cdn.closy.bot
```

Verificar que la API arranca sin errores:
```bash
pnpm dev
```

Las variables R2 son **opcionales** en Joi: la API arranca normalmente sin ellas. El módulo de imágenes (PR-18) retornará `503 Service Unavailable` con mensaje descriptivo si se intenta usar sin configuración.

---

## 7. Local Development

> **Opción recomendada: usa R2 directamente.** El bucket R2 funciona en desarrollo igual que en producción — no hay razón para no usarlo si tienes credenciales. MinIO es solo para casos específicos.

### Opción A — R2 directo (recomendada)

Si ya seguiste los pasos 1–6, ya tienes todo listo. Solo asegúrate de que las variables R2 estén en tu `.env` local y listo.

**Úsala cuando:**
- Tienes conexión a internet (casi siempre)
- Quieres entorno idéntico a producción
- Ya tienes credenciales Cloudflare

### Opción B — MinIO local (solo si no puedes usar R2)

Usa MinIO únicamente si:
- Desarrollas **offline** (sin internet)
- Eres un dev nuevo **sin acceso aún** a las credenciales R2 del equipo
- Necesitas correr **tests de integración en CI** sin tocar infra real

Para desarrollar PR-18 sin cuenta Cloudflare real, puedes usar **MinIO** como emulador S3-compatible local.

### Agregar MinIO al docker-compose

Añadir los siguientes servicios a `docker-compose.yml`:

```yaml
services:
  # ... servicios existentes (postgres, etc.) ...

  minio:
    image: minio/minio:latest
    container_name: closy-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    ports:
      - '9000:9000'   # S3 API endpoint
      - '9001:9001'   # MinIO Console UI
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    container_name: closy-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin123;
        mc mb --ignore-existing local/closy-bot-products;
        mc anonymous set public local/closy-bot-products;
        exit 0;
      "

volumes:
  # ... otros volúmenes ...
  minio_data:
    driver: local
```

### Variables de entorno para MinIO local

```bash
# MinIO local (equivalente a R2 en desarrollo)
R2_ACCOUNT_ID=local
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin123
R2_BUCKET_NAME=closy-bot-products
R2_PUBLIC_URL=http://localhost:9000/closy-bot-products
```

> **Nota para PR-18:** El cliente AWS SDK v3 deberá usar `endpoint: 'http://localhost:9000'` y `forcePathStyle: true` cuando `NODE_ENV=development` para apuntar a MinIO.

### Acceder a MinIO Console

- URL: [http://localhost:9001](http://localhost:9001)
- Usuario: `minioadmin` / Contraseña: `minioadmin123`
- Desde la consola puedes explorar objetos, crear buckets y verificar uploads.

---

## 8. Security Best Practices

### Bucket privado por defecto

- **El bucket debe permanecer privado.** El acceso público se sirve ÚNICAMENTE a través del CDN (R2.dev subdomain o custom domain configurado en el Paso 3).
- **No habilitar** "Public Access" directamente al bucket; usar siempre el CDN.
- Las URLs firmadas (presigned URLs) son generadas server-side en PR-18 para uploads directos del cliente.

### Rotación de API Credentials

Cuando necesites rotar credenciales (recomendado cada 90 días o ante sospecha de filtración):

1. En Cloudflare R2 → **Manage R2 API tokens**, crear un **nuevo token** con los mismos permisos
2. Actualizar la variable `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` en tu gestor de secretos / `.env` de producción
3. Reiniciar la API para que tome las nuevas variables
4. Verificar que el servicio responde correctamente (uploads/downloads funcionan)
5. **Solo después de verificar:** invalidar (Delete) el token anterior en el dashboard de Cloudflare

> **Regla de oro:** Nunca invalides el token viejo antes de verificar que el nuevo funciona.

### Variables en producción

- Nunca commitear valores reales de `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` en el repositorio.
- Usar gestor de secretos (ej: Vercel Env, Railway Secrets, AWS Secrets Manager, Doppler).
- El archivo `apps/api/.env.example` solo contiene placeholders vacíos.
- El bucket debe tener habilitado **Object-level logging** en producción para auditoría.

### Principio de mínimo privilegio

- El API token usado por la aplicación debe tener solo `Object Read & Write` sobre el bucket específico.
- **No usar** el "Global API Key" de Cloudflare para operaciones de R2.
- Para CI/CD (thumbnails, migrations): crear un token separado con permisos mínimos necesarios.
