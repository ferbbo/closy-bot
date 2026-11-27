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
