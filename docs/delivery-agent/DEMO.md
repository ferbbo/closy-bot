# DEMO — Closy Delivery Agent

> Cómo probar la vertical de domicilios en local **sin credenciales reales** (Meta Sandbox) y,
> después, la prueba de humo manual contra la app de prueba real **Closy-bot-qa**.
> Las corridas automáticas y los e2e usan **solo** el Meta Sandbox.

## 1. Demo local con el Meta Sandbox

### 1.1 Base de datos y datos demo
```bash
pg_ctlcluster 16 main start            # o docker compose up -d postgres
export DATABASE_URL=postgresql://closy:closy_dev_password@localhost:5432/closy_dev
pnpm db:generate && pnpm db:push        # schema aditivo de la vertical
pnpm db:seed:delivery                   # "Burger Barrio": 4 categorías, 14 productos, 3 zonas
```

### 1.2 Graph API falso (terminal 1)
```bash
pnpm meta:sandbox                       # http://127.0.0.1:4010 (META_SANDBOX_PORT para cambiarlo)
```
Imprime las variables a exportar en la terminal de la API (valores ficticios del sandbox):
`WHATSAPP_API_URL`, `WHATSAPP_API_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_SANDBOX`, `META_APP_ID`, `META_APP_SECRET`.

Inspección:
```bash
curl http://127.0.0.1:4010/__sandbox/sent        # mensajes que "envió" el bot
curl http://127.0.0.1:4010/__sandbox/templates   # plantillas registradas
curl -X POST http://127.0.0.1:4010/__sandbox/fail-next \
  -H 'Content-Type: application/json' \
  -d '{"endpoint":"messages","httpStatus":400,"code":131047,"message":"Re-engagement message"}'
curl -X POST http://127.0.0.1:4010/__sandbox/reset
```

### 1.3 API (terminal 2)
```bash
export FEATURES_MODE=dev DELIVERY_ENABLED=true NODE_ENV=development
# + las variables impresas por meta:sandbox
pnpm dev
```
El canal del comercio demo debe existir con `externalId = WHATSAPP_PHONE_NUMBER_ID` del sandbox
(`sandbox-phone-number-id`) y el comercio con `industry=restaurante` (lo crea el seed).

### 1.4 Simular mensajes de clientes (terminal 3)
```bash
pnpm simulate:whatsapp "hola, quiero 2 hamburguesas sencillas sin cebolla y una coca 400" --from +573000000101
pnpm simulate:whatsapp --audio --from +573000000101              # nota de voz (fixture del sandbox)
pnpm simulate:whatsapp "quiero esta" --image --from +573000000101 # foto (fixture del sandbox)
pnpm simulate:whatsapp "a la cra 27 #45-12 cabecera, pago en efectivo con 50" --from +573000000101
pnpm simulate:whatsapp "dale" --from +573000000101
```
Cada llamada firma el webhook con `WHATSAPP_APP_SECRET` (`X-Hub-Signature-256`) y lo envía a
`POST /webhooks/whatsapp` (`--api <url>` para otra URL). La respuesta del bot aparece en
`/__sandbox/sent`.

> El flujo conversacional completo (carrito, checkout, comanda) se habilita a medida que se
> integran los slices F2–F5 (ver `STATUS.md`).

## 2. Prueba real con Closy-bot-qa (manual, solo el owner)

> Las corridas programadas **no** hacen esto ni tienen estas credenciales. Ningún secreto va al repo.

1. **Variables locales** (en tu `.env` local, nunca commiteado): `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID` (número de prueba de Meta), `WHATSAPP_APP_SECRET` (App Secret de
   Closy-bot-qa), `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (el que configures en el webhook), `META_APP_ID`,
   `META_APP_SECRET`, `WABA_ID`. `WHATSAPP_API_URL=https://graph.facebook.com`,
   `WHATSAPP_API_VERSION=v21.0`, `FEATURES_MODE=dev`, `DELIVERY_ENABLED=true`. Sin
   `WHATSAPP_SANDBOX`.
2. **Túnel HTTPS** a la API local (ngrok, cloudflared…) y en developers.facebook.com → Closy-bot-qa →
   WhatsApp → Configuration: cambiar el **callback** del webhook a `https://<túnel>/webhooks/whatsapp`
   con el verify token del paso 1 (hoy apunta a una URL ngrok antigua). Verificar que los campos
   `messages`, `message_template_status_update`, `template_category_update` y
   `phone_number_quality_update` sigan suscritos.
3. **Destinatario de prueba:** agregar tu número personal en la lista de números de prueba de la app.
4. **Canal y comercio:** crear el `Channel` del número de prueba (`externalId` = Phone Number ID,
   `wabaId` = WABA ID) asociado al comercio demo, y poner `merchant.whatsappNumber` = número del
   encargado (tu segundo número o el mismo para pruebas).
5. **Plantillas:** `WABA_ID=<id> WHATSAPP_ACCESS_TOKEN=<token> pnpm tsx scripts/register-whatsapp-templates.ts --apply`
   (llega con S1.4) y esperar `APPROVED` (llega por el webhook `message_template_status_update`).
6. **Checklist de humo:**
   - [ ] Texto: "hola" → saludo con aviso de privacidad (una sola vez).
   - [ ] Pedido natural con notas → carrito correcto con precios de la BD.
   - [ ] Nota de voz → eco "🎙️ Entendí: «…»" y mismo carrito.
   - [ ] Foto de un producto → candidatos del catálogo, sin tocar el carrito hasta elegir.
   - [ ] Checkout completo (dirección + barrio + pago en un mensaje) → resumen exacto → "dale" → pedido.
   - [ ] Comanda al encargado; comandos `preparando N`, `salio N`, `entregado N` → estado al cliente
         por plantilla utility (`pedido_en_preparacion`, `pedido_en_camino`, `pedido_entregado`).
   - [ ] "no me escriban más" → opt-out; la siguiente transición no envía nada.
