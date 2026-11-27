# DECISIONS — registro de decisiones (ADR-lite)

> Toda decisión autónoma de Tier ≥ 1 se agrega aquí (solo el Integrador escribe). Formato:
> `### D-NNN · <título> · Tier <n> · <run-id> · <fecha>` + Contexto · Decisión · Alternativas descartadas · Reversión.

### D-001 · La vertical vive como módulo dentro de `apps/api` · Tier 2 · plan · 2026-11-27
- **Contexto:** webhook, outbox, Prisma, orquestador y servicios de carrito y checkout viven en `apps/api`. No existen paquetes compartidos.
- **Decisión:** `apps/api/src/verticals/delivery/` + `VerticalRouter` con un hook de ~15 líneas en el orquestador. Lo aprobó el owner.
- **Descartado:** `apps/delivery-agent` como app nueva, porque obliga a extraer paquetes o duplicar código.
- **Reversión:** el módulo es autocontenido y se puede extraer después a `packages/` si aparece una segunda vertical.

### D-002 · Integración git: rama `feat/delivery-agent` + PR por slice con auto-merge en verde · Tier 2 · plan · 2026-11-27
- Lo aprobó el owner. Al final, un PR `feat/delivery-agent → dev` con revisión humana. Nunca hay push a `dev` ni a `main`.

### D-003 · Alcance: backend + bot de WhatsApp; sin UI de dashboard · Tier 2 · plan · 2026-11-27
- Lo aprobó el owner. El dashboard solo debe seguir compilando con los nuevos valores de `OrderStatus`. Si se rompe un tipo en el dashboard, se corrige de forma mínima (mapear etiquetas).

### D-004 · Sin motor de modificadores; notas libres por ítem + adiciones como productos · Tier 1 · plan · 2026-11-27
- **Contexto:** el informe recomienda `producto → variantes → grupos de modificadores`. Con 36 h y el criterio de no sobre-ingeniería, se descarta en v1.
- **Decisión:** `CartItem.notes` / `OrderItem.notes` y categoría "Adiciones" con productos de precio propio.
- **Reversión:** se puede agregar `ModifierGroup` después sin romper nada (las notas siguen sirviendo para "sin X").

### D-005 · Tool calling con Groq (proveedor existente), sin RAG · Tier 1 · plan · 2026-11-27
- Modelo configurable con `DELIVERY_LLM_MODEL` (por defecto `llama-3.3-70b-versatile`). Precios solo en los resultados de las herramientas y totales renderizados por presenters. Fallback determinista ante timeout.

### D-006 · Verificación por commit adaptada al costo · Tier 1 · plan · 2026-11-27
- **Por commit:** tsc + lint + unit del slice + e2e de la vertical. **Por PR de slice:** suites completas unit + e2e + modo mvp. Correr toda la e2e por commit multiplicaría el tiempo sin agregar señal.

### D-007 · Debounce y comprobante pasan a P0 · Tier 1 · plan · 2026-11-27
- El informe los identifica como corrección (ráfagas de 4 mensajes, comprobantes falsificables). Voz y botón interactivo quedan P1.

### D-008 · Estados de pedido fuera de la ventana de 24 h no se envían · Tier 1 · plan · 2026-11-27
- Las plantillas de utilidad están fuera de v1. Un domicilio normal ocurre dentro de la ventana. Lo que no se envía queda en el log.

### D-009 · Puerto POS (Ports & Adapters) sin conector concreto · Tier 2 · plan · 2026-11-27
- **Contexto:** el owner pidió dejar un Adapter para integrar un POS más adelante. El informe recomienda no depender de ningún POS en el MVP y construir el primer conector solo cuando 3 clientes pagos compartan POS (candidatos: Loggro; Siigo/Alegra para facturación).
- **Decisión:** interfaz `PosAdapter` (push de pedido obligatorio; cancelar, catálogo y estados opcionales por capabilities), `PosAdapterRegistry` con fallback a `NoopPosAdapter`, `PosOrderSink` como segundo `OrderSink` (nunca bloquea la comanda por WhatsApp), campos aditivos `posProvider/posExternalId/posSyncStatus` en `Order` y kit `describePosAdapterContract()`. Las credenciales van por `secretRef` (nombre de una variable de entorno).
- **Descartado:** cola o outbox genérico para POS (sobre-ingeniería sin un conector real); endpoint de webhook entrante del POS (queda solo `parseStatusEvent` en la interfaz).
- **Reversión:** con `provider='none'` el puerto no tiene efecto.

### D-010 · Voz y foto de producto son P0 (decisión del owner) · Tier 2 · plan · 2026-11-27
- **Contexto:** el informe ponía la voz como P1 y la búsqueda de productos por imagen fuera del MVP. El owner pidió las dos capacidades explícitamente.
- **Decisión:** las dos con Groq (Whisper y un modelo de visión con salida JSON), modelos configurables, media procesada en memoria sin persistir. La visión solo describe: la identificación de producto y el precio salen del catálogo, y siempre se confirma con el cliente antes de agregar (RN-25). Se agrega el slice S5.0 (propagación de media + `MediaFetcher`) para que voz, imagen y comprobante no se pisen.
- **Descartado:** OCR de montos del comprobante (se puede falsificar; la validación es humana), embeddings de imagen contra fotos del catálogo (no hay fotos suficientes en un menú típico; queda para v2).
- **Riesgo:** F5 crece de 4 a 6 slices. Si el tiempo no alcanza, se recorta primero el botón interactivo y luego el debounce.

### D-011 · Conversación natural con herramientas + validador de cifras; checkout conversacional propio · Tier 2 · plan · 2026-11-27
- **Contexto:** el owner exige respuestas en lenguaje humano, sin depender de plantillas ni de opciones numeradas.
- **Decisión:** el LLM redacta todas las respuestas (persona RN-27) y conduce el checkout con herramientas (`fijar_entrega`, `cotizar_domicilio`, `fijar_pago`, `resumen_pedido`, `confirmar_pedido`). La exactitud se protege con: cifras solo desde herramientas, `GroundingValidator` (RN-28), bloque de resumen exacto y token ligado al hash para confirmar (RN-12). **El `CheckoutFlow` legacy no se toca**, así que hay menos riesgo para RN-21.
- **Descartado:** extender la máquina de estados determinista de `CheckoutFlow` (respuestas rígidas); dejar que el LLM escriba los totales sin validar.
- **Reversión:** las herramientas encapsulan la lógica; se puede volver a un flujo guiado reutilizándolas.

### D-012 · Plantillas utility para toda notificación iniciada por el negocio · Tier 2 · plan · 2026-11-27
- **Contexto:** dentro de la ventana de 24 h el texto libre está permitido. Las plantillas son obligatorias solo fuera de ella. Desde el 1-oct-2026 Meta cobra también los mensajes de servicio y las plantillas utility enviadas dentro de la ventana. Meta recategoriza cada mes las plantillas con contenido promocional y aplica bloqueos progresivos por mal uso.
- **Decisión:** conversación = texto libre. Notificaciones de estado, pago y comanda = plantilla utility (`template_always` por defecto, `auto` configurable). Catálogo de 10 plantillas sin promoción, lint en tests, registro con un script (dry-run), `BusinessMessenger` con ventana, opt-out, topes y estado de las plantillas, y webhooks de calidad y recategorización.
- **Riesgo / pendiente humano:** las plantillas deben registrarse y aprobarse en el WABA de cada comercio (`scripts/register-whatsapp-templates.ts --apply`) antes de producción. El agente no puede hacerlo sin credenciales.

### D-013 · Configuración real de Meta después del desarrollo; Meta Sandbox local para pruebas · Tier 1 · plan · 2026-11-27
- **Contexto:** la app, el WABA, el número y las plantillas son por cliente, y todavía no hay cliente. El owner pidió diferir esa configuración y usar una app de prueba para los tests.
- **Decisión:** slice S1.5 con una identidad de app de prueba ficticia + un Graph API falso local (mensajes, plantillas, media, errores) + webhooks firmados. Todos los e2e y la demo local lo usan. `WHATSAPP_API_URL` (ya configurable en `WhatsAppOutboundService`) apunta al sandbox. La configuración real queda como checklist en STATUS §Post-desarrollo.
- **Descartado:** una app de desarrollador real de Meta con número de prueba (requiere la cuenta del owner; se puede agregar después para smoke tests manuales sin cambiar código).

### D-014 · App de prueba real: Closy-bot-qa, solo para smoke tests manuales · Tier 1 · plan · 2026-11-27
- **Contexto:** el owner conectó el MCP de Meta (Meta Social Technologies) y eligió la app existente **Closy-bot-qa** (`1579465619796698`, portfolio `927651103585574`) como app de prueba. Ya tenía el caso de uso de WhatsApp y el webhook `whatsapp_business_account`.
- **Decisión:** se agregaron por MCP los campos de webhook que exige F-22 (`message_template_status_update`, `template_category_update`, `phone_number_quality_update`, `message_template_quality_update`). La app se usa solo en la prueba de humo manual (DEMO.md). Los e2e y las corridas programadas siguen 100 % contra el Meta Sandbox: sin credenciales reales en el repo ni en el entorno de las corridas.
- **Pendiente humano:** actualizar el callback (hoy es una URL ngrok antigua), cargar los secretos localmente y registrar las plantillas en el WABA de prueba.

### D-015 · La BD es la única fuente de verdad comercial (RN-00) · Tier 2 · plan · 2026-11-27
- **Contexto:** el owner exige que precios, cantidades, productos, FAQ, políticas, imágenes y toda la información comercial salgan siempre de la BD.
- **Auditoría (huecos cerrados):** (1) el system prompt incluía horario y políticas, y ahora solo lleva la persona; (2) `restaurante.defaults` podía traer zonas u horarios inventados, y ahora solo trae parámetros técnicos más `isCommerciallyComplete`; (3) no había herramienta para FAQ ni políticas, y se agrega `consultar_negocio` (reusa `PlaybookService`); (4) el validador solo cubría montos, y ahora cubre también cuentas, llaves, URLs y nombres de producto; (5) memoria y `lastCandidates` podían usarse como fuente de precio, y ahora queda prohibido (sin caché comercial entre turnos). Imágenes: solo `Product.imageUrl` y `menuImageUrl`. POS: sincroniza a la BD y nunca se lee directo.
- **Reversión:** no aplica; es una regla raíz.
