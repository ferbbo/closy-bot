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

### D-016 · Unique de CartItem con notes: lookup legacy con `notes=''` · Tier 2 · run-20261127-2008 · 2026-11-27
- **Contexto:** SPEC §3.4 cambia el unique `[cartId, variantId]` → `[cartId, variantId, notes]`; el input compuesto de Prisma cambia de nombre.
- **Decisión:** `cart-item.repository.findByCartAndVariant` usa `cartId_variantId_notes` con `notes: ''` (los ítems legacy siempre tienen `''`). `db push` pide `--accept-data-loss` por el unique nuevo, que es un superconjunto del anterior y no puede tener duplicados.
- **Reversión:** volver al unique anterior (requiere que no existan líneas con notas).

### D-017 · Estados `preparing`/`on_the_way` en el dashboard e industria `restaurante` en legacy · Tier 2 · run-20261127-2008 · 2026-11-27
- `orders.service` ALLOWED_TRANSITIONS: `preparing → on_the_way|cancelled`, `on_the_way → delivered` (igual a RN-14); transiciones legacy intactas. `Industry` de dominio suma `restaurante`; en flujos legacy usa el playbook genérico y la persona LLM genérica.

### D-018 · Router vertical con `register()` y tipos re-exportados de `contracts.ts` · Tier 1 · run-20261127-2008 · 2026-11-27
- `VerticalRouterService.register(handler)` en lugar de multi-provider (evita el ciclo Orchestrator ↔ Delivery). Un error de un handler se loguea y cae a los flujos legacy. `vertical.types.ts` re-exporta desde `delivery/contracts.ts` (fuente única).

### D-019 · `contracts.ts` exento de prettier/ban-types · Tier 1 · run-20261127-2008 · 2026-11-27
- Para conservar la copia literal de CONTRACTS.md §1.

### D-020 · Variables del Meta Sandbox opt-in por suite · Tier 1 · run-20261127-2008 · 2026-11-27
- `applySandboxEnv(baseUrl)` + `import()` dinámico de AppModule (ConfigModule toma la foto del entorno al importarse). Fijarlas en `jest-e2e.setup.ts` activaría `MetaSignatureGuard` en suites legacy sin firma.

### D-021 · Graph API falso con `http` de Node · Tier 1 · run-20261127-2008 · 2026-11-27
- express no es resoluble desde apps/api (pnpm estricto). Fixtures de media en memoria con firmas reales (OggS/JPEG). Un hijo síncrono (`execFileSync`) bloquea el event loop del sandbox: los e2e usan `execFile` asíncrono.

### D-022 · `FakeGraphApi.sent()` sin `image` (contrato) · Tier 2 · run-20261127-2008 · 2026-11-27
- El contrato congelado no incluye mensajes `image`; S5.4 (`ver_foto_producto`, P1) deberá extender el contrato.

### D-023 · LLM con herramientas (S1.3) · Tier 1 · run-20261127-2008 · 2026-11-27
- Métodos nuevos obligatorios en `LlmProvider`; `generateJson<T>` no valida la forma (lo hace el llamador); modelo `DELIVERY_LLM_MODEL`, timeout 8 s, sin reintentos; `runToolLoop` no depende de `LLM_ENABLED` (gating del llamador); log `llm.tool_loop` sin PII.

### D-024 · Preset `restaurante` de MerchantConfig vacío (RN-00) · Tier 2 · run-20261127-2008 · 2026-11-27
- Antes caía al preset `ropa` e inventaba medios de pago, tarifa y política para restaurantes. Ahora `paymentMethods: []`, `shippingConfig: {}`, `returnPolicy: null`.

### D-025 · PATCH `deliveryConfig` con gating · Tier 2 · run-20261127-2008 · 2026-11-27
- Flag apagado → 403; industria ≠ restaurante → 403; la respuesta suma `deliveryConfig` (aditivo); `null` lo borra; mezcla sobre lo guardado y persiste la config completa validada (400 con path exacto).

### D-026 · Defaults técnicos de DeliveryConfig · Tier 1 · run-20261127-2008 · 2026-11-27
- `prepTimeMinutes=0` = no configurado; `pickupEnabled=false`; `maxOrderAmountWithoutHuman=300000` (umbral de seguridad RN-17, no se muestra); `temporarilyClosed` sin `nextOpening`; `quote` no revisa `pickupEnabled` (lo hace `fijar_entrega`). Propuesta pendiente: `PICKUP_DISABLED` en `ShippingQuote`.

### D-027 · DTO del webhook acepta campos WABA · Tier 2 · run-20261127-2008 · 2026-11-27
- Antes los webhooks de plantillas/calidad respondían 400 y Meta reintentaba. `messaging_product`/`metadata` solo se omiten para valores WABA puros; `messages` sigue estricto (test).

### D-028 · `WHATSAPP_SANDBOX` · Tier 2 · run-20261127-2008 · 2026-11-27
- Variable nueva (Joi boolean, default false, `.env.example`). Solo con `true` y `NODE_ENV=test` el outbound sale del dry-run hacia el Meta Sandbox. Sin efecto en producción.

### D-029 · Políticas de BusinessMessenger · Tier 1 · run-20261127-2008 · 2026-11-27
- Plantilla sin fila de estado = usable; ventana desde `MessageLog` IN del comercio; tope por pedido y destinatario (prefijo `order:{id}:`); opt-out solo para plantillas al cliente; flag apagado → `skipped TEMPLATE_NOT_USABLE` sin BD; parámetros vacíos → `-`; `notifications` vía `DeliveryConfigService.parseStored`; el controlador resuelve el handler WABA con `ModuleRef` (`strict:false`).

### D-030 · Alcance del GroundingValidator · Tier 1 · run-20261127-2008 · 2026-11-27
- Montos, minutos, secuencias de ≥ 6 dígitos y URLs contra los `data` de herramientas del turno. Los nombres de producto se protegen por construcción (presenters + guard RN-02), sin detección léxica. Respaldo: último bloque de presenter del turno o pedir reformular.

### D-031 · Notas y extras en CartService/CheckoutService · Tier 2 · run-20261127-2008 · 2026-11-27
- Notas normalizadas (trim, espacios, minúsculas `es`, máx. 120); sin notas = camino legacy. `extras`: `neighborhood` → `shippingAddress`, `reference` → `Order.notes`, total = subtotal + tarifa; sin extras idéntico a legacy.

### D-032 · Herramientas de carrito · Tier 1 · run-20261127-2008 · 2026-11-27
- Reducir cantidad con `CartItemRepository.updateQuantity` (el servicio valida stock al bajar); varias líneas del mismo variantId → `AMBIGUOUS_ITEM`; `maxQtyPerLine` sobre el total de la línea; `data.text` = bloque exacto del presenter.

### D-033 · Matcher y herramientas de catálogo · Tier 1 · run-20261127-2008 · 2026-11-27
- Puntaje = fracción de palabras de la consulta presentes (normalizado); MATCHED si 1 candidato o mejor ≥ 0.5 y +0.2 sobre el segundo. `consultar_negocio` no devuelve las FAQ genéricas del playbook legacy (son defaults de código, RN-00) y relee `deliveryConfig` en el turno.

### D-034 · Guards deterministas en el handler · Tier 1 · run-20261127-2008 · 2026-11-27
- Opt-out, temas ajenos, comercio incompleto y horario con textos fijos (`DELIVERY_TEXTS`; "cerrado" usa la próxima apertura de la BD). Reactivación de opt-out al volver a agregar al carrito. Historial = últimos 8 `MessageLog` sin el mensaje actual.

### D-035 · Inyección de dependencias del agente · Tier 1 · run-20261127-2008 · 2026-11-27
- `HandoffService` vía `ModuleRef` (`strict:false`) para evitar ciclos; token `DELIVERY_LLM_PROVIDER` (`null` → Groq) para inyectar `FakeLlmProvider` en e2e.

### D-036 · PosOrderSink · Tier 1 · run-20261127-2008 · 2026-11-27
- Noop declara `pushOrder=false`; el sink marca `skipped` sin llamar al adapter si `provider==='none'` o `!capabilities().pushOrder`. Aviso al encargado con `BusinessMessenger.alertOperation` (`order:{id}:pos_failed`). Reintento inmediato; un adapter que lanza = no reintentable (evita duplicados). Secretos por `process.env[secretRef]`, enmascarados en errores. Solo `synced` corta la repetición.

### D-037 · fijar_entrega / cotizar_domicilio · Tier 1 · run-20261127-2008 · 2026-11-27
- Sin modalidad → `delivery`; una dirección sin barrio reconocible conserva el barrio previo; cambiar modalidad, dirección, barrio o carrito borra `quote` y `summary` (RN-12); cotización no OK borra la `quote`.

### D-038 · fijar_pago y guards · Tier 1 · run-20261127-2008 · 2026-11-27
- Errores como datos; efectivo sin monto → `pedirMontoEfectivo`; número < 1000 sin sufijo = miles; `NEEDS_QUOTE` solo con efectivo + monto; `AmountLimitGuard.escalate` nunca lanza. Deuda: helper de draft propio y `paymentInstructions` duplicado (unificar con `CheckoutDraftStore` / `business-info.tool`).

### D-039 · Confirmación (RN-12) · Tier 1 · run-20261127-2008 · 2026-11-27
- `resumen_pedido` recotiza con el subtotal vivo (RN-00); afirmación por regex determinista sin negaciones; "turno anterior" = `issuedAt` < `now` del turno; COD → `confirmed` + `confirmedAt`, transferencia → `pending_payment` + `pago_pendiente`; total > límite → `pending_payment` + handoff; la comanda sale solo en `confirmed`; confirmar limpia `optedOutAt`. El agente anexa el bloque exacto del presenter si el LLM no lo incluyó.

### D-040 · Reloj del turno y metadata del handler · Tier 1 · run-20261127-2008 · 2026-11-27
- `now = new Date()` (ms): el timestamp del webhook tiene precisión de 1 s y hacía fallar la regla de "turno anterior". El handler relee la metadata antes de guardar y fusiona solo sus claves (`privacyNoticeAt`, `lastCandidates`) para no pisar el draft escrito por las herramientas.

### D-041 · Comandos de operación y criterio de facturable · Tier 2 (criterio) · run-20261127-2008 · 2026-11-27
- Desambiguación `agotado/disponible` en memoria (TTL 10 min por comercio); un número suelto solo es comando si hay lista pendiente; búsqueda por prefijos normalizados con `updateMany` filtrado por comercio. `cerrar/abrir tienda` cambia solo `temporarilyClosed`.
- ⚠️ **Facturable (§0.2):** sin campo de "confirmado por el cliente", todo `Order` se considera confirmado por el cliente (lo crea `confirmar_pedido`); período por `createdAt`; se excluyen los cancelados dentro de 24 h desde la creación (y los cancelados sin `cancelledAt`); los de las últimas 24 h no cancelados cuentan de forma provisional. **Revisión humana.**

### D-042 · Delegación de comandos del encargado en el legacy · Tier 2 · run-20261127-2008 · 2026-11-27
- `merchant-command-parser` devuelve `delivery_passthrough` solo con el flag activo; `merchant-command.service` consulta `DELIVERY_MERCHANT_COMMANDS` ([comandos de cocina, comandos de operación]) y, si nadie responde, devuelve el mismo "Comando no reconocido". Flag y handlers vía `ModuleRef` (`strict:false`), sin imports entre módulos. Con el flag apagado, legacy idéntico.

### D-043 · Ciclo de vida · Tier 1 · run-20261127-2008 · 2026-11-27
- `paid` ≈ `confirmed`, `shipped` ≈ `on_the_way`; referencia por `orderCode` exacto o número final (sin falsos positivos tipo 42 vs 142); escritura compare-and-set; `pedido_confirmado` comparte `dedupeKey order:{id}:status:confirmed` con `confirmar_pedido` (sin doble envío).

### D-044 · Autoservicio del cliente · Tier 1 · run-20261127-2008 · 2026-11-27
- Lectura directa con Prisma; `cancelar_pedido` sin código usa el último activo; ya cancelado → ok `yaCancelado`; `repetir_pedido` conserva notas, recorta a `maxQtyPerLine` y reporta inactivos o fallidos como agotados; precio actual vía `CartService.addItem` (RN-00).
