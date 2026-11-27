# CONTRACTS — ejecución en paralelo por Track

> Los contratos se **congelan** en S1.1-T3 como `apps/api/src/verticals/delivery/contracts.ts` (copia literal de §1).
> Cambiar un contrato es **Tier 2**: solo lo puede hacer el Integrador, se registra en `DECISIONS.md` y se avisa en el brief de los subagentes afectados.
> Un subagente **implementa** contra el contrato y **no edita** archivos fuera de su lista de propiedad (§3).

## 1. Interfaces (TypeScript)

```ts
// ===== Config =====================================================
export interface DeliveryZone {
  id: string;            // slug estable
  name: string;          // "Cabecera"
  aliases: string[];     // ["cabecera del llano"]
  fee: number;           // COP, entero
  minOrder: number;      // COP, sobre el subtotal
  etaMinutes: number;    // tiempo de trayecto
}
export interface OpeningWindow { day: 0 | 1 | 2 | 3 | 4 | 5 | 6; open: string; close: string } // "HH:mm", 0 = domingo; close < open ⇒ cruza medianoche
export interface DeliveryConfig {
  timezone: string;                       // IANA, por defecto "America/Bogota"
  openingHours: OpeningWindow[];
  temporarilyClosed: boolean;
  prepTimeMinutes: number;
  zones: DeliveryZone[];
  freeDeliveryAbove: number | null;
  pickupEnabled: boolean;
  trackStock: boolean;
  maxQtyPerLine: number;
  maxLines: number;
  maxOrderAmountWithoutHuman: number;
  assistantName: string | null;
  toneHints: string;
  notifications: { mode: 'template_always' | 'auto'; templateLanguage: string; maxBusinessInitiatedPerOrder: number };
  privacyPolicyUrl: string | null;
  menuImageUrl: string | null;
  pos: PosIntegrationConfig;               // ver Puerto POS; por defecto { provider: 'none', enabled: false, settings: {}, secretRef: null }
}
export type ConfigValidation = { ok: true; value: DeliveryConfig } | { ok: false; errors: Array<{ path: string; message: string }> };
export interface OpenStatus { open: boolean; nextOpening?: { day: number; time: string } }

// ===== Shipping (S1.2 produce, S3.1 consume) ======================
export type Fulfillment = 'delivery' | 'pickup';
export type ShippingQuote =
  | { ok: true; zoneId: string | null; zoneName: string | null; fee: number; etaMinutes: number; fulfillment: Fulfillment }
  | { ok: false; reason: 'NEEDS_NEIGHBORHOOD' | 'OUT_OF_COVERAGE' | 'BELOW_MINIMUM'; minOrder?: number; missing?: number };
export interface ShippingQuoteInput { merchantId: string; address?: string; neighborhood?: string; subtotal: number; fulfillment: Fulfillment }
export interface ShippingQuoteProvider { quote(input: ShippingQuoteInput): Promise<ShippingQuote> }
export const SHIPPING_QUOTE_PROVIDER = Symbol('SHIPPING_QUOTE_PROVIDER');

// ===== Catálogo (S2.1) ============================================
export interface VariantCandidate { variantId: string; productId: string; label: string; unitPrice: number; score: number }
export type MatchResult =
  | { status: 'MATCHED'; query: string; candidate: VariantCandidate }
  | { status: 'AMBIGUOUS'; query: string; candidates: VariantCandidate[] } // máximo 5
  | { status: 'NOT_FOUND'; query: string };
export interface ParsedOrderLine { query: string; quantity: number; notes: string }

// ===== Carrito (S2.2) =============================================
export interface AddItemOptions { notes?: string; skipStockCheck?: boolean }
export interface CartLineView { itemId: string; label: string; notes: string; quantity: number; unitPrice: number; lineTotal: number }
export interface CartView { cartId: string; lines: CartLineView[]; subtotal: number }

// ===== LLM con herramientas (S1.3) ================================
export interface LlmToolDef { name: string; description: string; parameters: Record<string, unknown> } // JSON Schema
export interface LlmToolCall { id: string; name: string; arguments: Record<string, unknown> }
export interface LlmToolRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string; toolCalls?: LlmToolCall[] }>;
  tools: LlmToolDef[];
  model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number;
}
export type LlmToolResponse =
  | { ok: true; text: string | null; toolCalls: LlmToolCall[]; usage?: { inputTokens: number; outputTokens: number } }
  | { ok: false; reason: 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE' };
export type ToolHandler = (args: Record<string, unknown>, ctx: DeliveryTurnContext) => Promise<ToolResult>;
export interface ToolResult { ok: boolean; data?: unknown; error?: string }   // `data` compacto (≤ 5 ítems)
export interface ToolLoopResult { finalText: string | null; toolTrace: Array<{ name: string; ok: boolean }>; fallbackReason?: string }

// ===== Checkout conversacional (S3.x) =============================
export interface CheckoutDraft {                  // Conversation.metadata.delivery.checkout
  cartId: string;
  fulfillment?: Fulfillment; address?: string; neighborhood?: string; reference?: string;
  quote?: Extract<ShippingQuote, { ok: true }>;
  paymentMethod?: 'cod' | 'transfer'; cashChangeFor?: number | null;
  summary?: { hash: string; token: string; issuedAt: string; shownInMessageId: string }; // RN-12
}
export interface ConversationalCandidates { items: VariantCandidate[]; createdAt: string } // metadata.delivery.lastCandidates (TTL 30 min, RN-02)
export interface OrderSummaryView { block: string; total: number; hash: string; confirmationToken: string }
export type GroundingCheck = { ok: true } | { ok: false; invalidFigures: string[] };
export interface GroundingValidator { check(text: string, allowed: { amounts: number[]; minutes: number[] }): GroundingCheck }
// Herramientas del agente (nombres estables): buscar_producto, ver_menu, agregar_al_carrito, quitar_del_carrito, ver_carrito,
// fijar_entrega, cotizar_domicilio, fijar_pago, resumen_pedido, confirmar_pedido, estado_pedido, cancelar_pedido, repetir_pedido, pedir_humano

// ===== Mensajería iniciada por el negocio (S1.4) ==================
export type TemplateName = 'pedido_confirmado' | 'pago_pendiente' | 'pago_confirmado' | 'pedido_en_preparacion' | 'pedido_en_camino'
  | 'pedido_entregado' | 'pedido_cancelado' | 'seguimiento_atencion' | 'comanda_nuevo_pedido' | 'alerta_operacion';
export interface TemplateDefinition {
  name: TemplateName; category: 'UTILITY'; language: string; audience: 'customer' | 'merchant';
  body: string;                                   // con {{named_params}}
  params: Array<{ name: string; example: string; maxLength: number }>;
}
export interface NotifyRequest {
  merchantId: string; channelId?: string | null; to: string; conversationId?: string | null; orderId?: string | null;
  template: TemplateName; params: Record<string, string>;   // sin '\n'; el messenger los sanea
  dedupeKey: string; freeText?: string;                      // texto libre equivalente (para mode=auto o fallback RN-31)
}
export type NotifyResult =
  | { status: 'queued'; channel: 'template' | 'text'; outboxId: string }
  | { status: 'skipped'; reason: 'OPTED_OUT' | 'WINDOW_CLOSED_NO_TEMPLATE' | 'TEMPLATE_NOT_USABLE' | 'CAP_REACHED' | 'DUPLICATE' };
export interface BusinessMessenger { notify(req: NotifyRequest): Promise<NotifyResult> }
export interface CustomerServiceWindow { isOpen(merchantId: string, phone: string, now?: Date): Promise<boolean> }

// ===== Turno del agente (S2.3) ====================================
export interface DeliveryTurnContext {
  merchantId: string; customerId: string; conversationId: string; customerPhone: string;
  text: string; config: DeliveryConfig; now: Date;
  seenVariantIds: Set<string>;        // RN-02: variantIds devueltos por buscar_producto en este turno
}
export interface DeliveryTurnResult { response: string; intent: 'DELIVERY_ORDER' | 'DELIVERY_MENU' | 'DELIVERY_STATUS' | 'DELIVERY_CHECKOUT' | 'DELIVERY_GUARD'; startCheckout?: boolean }

// ===== Router vertical (S1.1, compartido) =========================
export interface VerticalContext {
  merchant: { id: string; name: string; industry: string | null; playbookConfig: unknown };
  customer: { id: string; phone: string };
  conversation: { id: string; metadata: unknown };
  input: { messageId: string; text: string; timestamp: Date; mediaType?: 'audio' | 'image' | 'video' | 'document' | 'sticker'; mediaId?: string; mimeType?: string; caption?: string };
}
export interface VerticalResult { response: string; shouldSend: boolean; intent: string }
export interface VerticalHandler { readonly name: string; canHandle(ctx: VerticalContext): Promise<boolean>; handle(ctx: VerticalContext): Promise<VerticalResult | null> } // null ⇒ cae a los flujos legacy

// ===== Ciclo de vida (S4.1 produce, S4.2/S4.3/S5.3 consumen) ======
export type DeliveryOrderStatus = 'pending_payment' | 'confirmed' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';
export const DELIVERY_TRANSITIONS: Record<DeliveryOrderStatus, DeliveryOrderStatus[]> = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered'],
  delivered: [],
  cancelled: [],
};
export type TransitionResult =
  | { ok: true; orderId: string; orderCode: string; from: DeliveryOrderStatus; to: DeliveryOrderStatus; notified: boolean }
  | { ok: true; idempotent: true; orderCode: string; status: DeliveryOrderStatus }
  | { ok: false; reason: 'NOT_FOUND' | 'INVALID_TRANSITION'; orderCode?: string; status?: DeliveryOrderStatus };
export interface DeliveryOrderLifecycle {
  transition(merchantId: string, orderRef: string /* "42" | "ORD-42" | "ORD-0042" */, to: DeliveryOrderStatus,
             opts?: { etaMinutes?: number; reason?: string; actor: 'merchant' | 'customer' | 'system' }): Promise<TransitionResult>;
}

// ===== Salida a cocina (S3.3) =====================================
export interface KitchenTicket {
  orderId: string; orderCode: string; createdAt: Date;
  lines: Array<{ quantity: number; label: string; notes: string }>;
  fulfillment: Fulfillment; address: string | null; neighborhood: string | null;
  paymentMethod: string; cashChangeFor: number | null; total: number; etaMinutes: number | null;
  customerName: string; customerPhoneMasked: string;
}
export interface OrderSink { readonly name: string; publish(merchantId: string, ticket: KitchenTicket): Promise<void> } // idempotente por orderId
export const ORDER_SINKS = Symbol('ORDER_SINKS'); // multi-provider: OrderSink[]

// ===== Puerto POS (S3.4) — Ports & Adapters ======================
export type PosProvider = 'none' | 'loggro' | 'siigo' | 'alegra' | 'fudo' | 'webhook' | (string & {});
export interface PosIntegrationConfig {           // vive en DeliveryConfig.pos
  provider: PosProvider;                          // 'none' por defecto
  enabled: boolean;
  settings: Record<string, string>;               // no secretos (ej. storeId, branchId)
  secretRef: string | null;                       // NOMBRE de la variable de entorno con la credencial; nunca el valor
}
export interface PosCapabilities { pushOrder: boolean; cancelOrder: boolean; pullCatalog: boolean; statusUpdates: boolean }
export interface PosContext { merchantId: string; config: PosIntegrationConfig; resolveSecret: () => string | null }
export type PosResult<T = void> = { ok: true; value: T } | { ok: false; retryable: boolean; error: string };
export interface PosCatalogItem { externalId: string; name: string; variantName?: string; price: number; active: boolean; category?: string }
export interface PosStatusEvent { externalOrderId: string; status: DeliveryOrderStatus; etaMinutes?: number; occurredAt: Date }
export interface PosAdapter {
  readonly provider: PosProvider;
  capabilities(): PosCapabilities;
  pushOrder(ticket: KitchenTicket, ctx: PosContext): Promise<PosResult<{ externalId: string }>>; // idempotente por ticket.orderId
  cancelOrder?(externalId: string, reason: string, ctx: PosContext): Promise<PosResult>;
  pullCatalog?(ctx: PosContext): Promise<PosResult<PosCatalogItem[]>>;                      // futuro: sincronizar menú
  parseStatusEvent?(payload: unknown, headers: Record<string, string>, ctx: PosContext): PosStatusEvent | null; // futuro: webhook POS → lifecycle
}
export const POS_ADAPTERS = Symbol('POS_ADAPTERS'); // multi-provider: PosAdapter[]
export interface PosAdapterRegistry { resolve(config: PosIntegrationConfig): PosAdapter } // fallback: NoopPosAdapter
// Contract test kit: describePosAdapterContract(name: string, factory: () => PosAdapter): void

// ===== Multimodal (S5.0 produce MediaFetcher; S5.2 Transcriber; S5.3 ImageInterpreter) ==
export interface FetchedMedia { buffer: Buffer; mimeType: string; sizeBytes: number; durationSec?: number }
export type MediaResult<T> = { ok: true; value: T } | { ok: false; reason: 'TOO_LARGE' | 'TOO_LONG' | 'DOWNLOAD_FAILED' | 'TIMEOUT' | 'UNSUPPORTED' | 'PROVIDER_ERROR' | 'EMPTY' };
export interface MediaFetcher { fetch(merchantId: string, channelId: string | null, mediaId: string, limits: { maxBytes: number }): Promise<MediaResult<FetchedMedia>> }
export const MEDIA_FETCHER = Symbol('MEDIA_FETCHER');
export interface Transcriber { transcribe(media: FetchedMedia, opts: { language: 'es'; maxDurationSec: number }): Promise<MediaResult<{ text: string }>> }
export const TRANSCRIBER = Symbol('TRANSCRIBER');
export type ImageKind = 'product' | 'payment_receipt' | 'menu' | 'other';
export interface ImageInterpretation {
  kind: ImageKind;
  items: Array<{ query: string; quantity: number | null }>; // solo si kind='product'; máximo 5; sin precios ni ids
  confidence: 'HIGH' | 'MED' | 'LOW';
}
export interface ImageInterpreter { interpret(media: FetchedMedia, opts: { caption?: string; merchantCategories: string[] }): Promise<MediaResult<ImageInterpretation>> }
export const IMAGE_INTERPRETER = Symbol('IMAGE_INTERPRETER');
// Fakes: test/utils/fake-media.ts → FakeMediaFetcher, FakeTranscriber(text|failure), FakeImageInterpreter(interpretation|failure)

// ===== Utilidades de prueba (S1.3) ================================
// apps/api/test/utils/fake-llm.provider.ts
// new FakeLlmProvider([{ toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] }, { text: 'Listo' }])
```

## 2. Puntos de extensión en archivos legacy (los hace el dueño indicado, con cambios mínimos y retrocompatibles)

| Archivo legacy | Cambio permitido | Dueño |
|---|---|---|
| `prisma/schema.prisma` | Solo aditivo (SPEC §3.4, `SEND_INTERACTIVE` en S5.4) | Integrador |
| `apps/api/src/app.module.ts` | `imports: [DeliveryModule]` | Integrador |
| `orchestrator/conversation.orchestrator.ts` | Hook `verticalRouter.tryHandle` (S1.1-T4) | Integrador |
| `orchestrator/orchestrator.module.ts` | Importar o proveer `VerticalRouter` | Integrador |
| `common/feature-flags/feature-flags.service.ts`, `common/config/env.validation.ts`, `.env.example` | Flag y variables nuevas | Integrador |
| `services/cart.service.ts` | `addItem(..., opts?: AddItemOptions)` y notas en summary | Track B de S2.2 |
| `services/checkout.service.ts` | Solo `extras` en createOrder (S2.2). **`checkout.flow.ts` no se modifica**: la vertical hace el checkout con herramientas propias | S2.2 Track B |
| `workers/outbox-dispatcher/*`, `channels/whatsapp/whatsapp-outbound.service.ts`, controlador del webhook (campos de WABA) | `SEND_TEMPLATE` + webhooks de plantillas y calidad (S1.4) | S1.4 Track A (antes de S5.x) |
| `services/merchant-command-parser.service.ts`, `merchant-command.service.ts` | Delegar a `DeliveryCommandsService` cuando el comando no es legacy y el flag está activo | S4.1 Track A (S4.3 añade sus comandos en `DeliveryCommandsService`, no en legacy) |
| `merchant-settings/*` | Aceptar `deliveryConfig` | S1.2 Track B |
| `llm/interfaces/llm-provider.interface.ts`, `llm/providers/groq-llm.provider.ts`, `llm/llm.service.ts` | Métodos nuevos, sin cambiar los existentes | S1.3 Track C |
| `channels/whatsapp/*`, `OrchestratorInput` | Propagación de media (S5.0, Integrador) → luego debounce (S5.1) → interactive (S5.4) | Secuencial: S5.0 primero |
| `docs/delivery-agent/STATUS.md`, `DECISIONS.md` | Escritura | **Solo el Integrador** |

## 3. Matriz de propiedad de archivos por fase

| Fase | Track A | Track B | Track C | Integrador |
|---|---|---|---|---|
| F1 | S1.4: `delivery/messaging/**`, `scripts/register-whatsapp-templates.ts`, outbox dispatcher/outbound (SEND_TEMPLATE), campos de WABA en el controlador del webhook, `test/delivery-templates.e2e-spec.ts` | `delivery/config/**`, `merchant-settings/**` (deliveryConfig), `test/delivery-config.e2e-spec.ts` | `llm/**`, `test/utils/fake-llm.provider.ts` | S1.1 completo + archivos compartidos |
| F2 | `delivery/catalog/**`, `delivery/agent/tools/catalog.tools.ts`, `delivery/agent/fallback-parser.ts`, `delivery/presenters/menu.presenter.ts` | `services/cart.service.ts`, `services/checkout.service.ts` (extras), `delivery/agent/tools/cart.tools.ts`, `delivery/presenters/cart.presenter.ts` | — | S2.3: `delivery/agent/delivery-agent.*`, `delivery/agent/grounding-validator.*`, `delivery/handler/**`, `test/delivery-order.e2e-spec.ts` |
| F3 | `delivery/checkout/**`, `delivery/agent/tools/delivery.tools.ts` (fijar_entrega, cotizar_domicilio) | `delivery/handler/guards/opening-hours.guard.ts`, `delivery/agent/tools/payment.tools.ts` (fijar_pago), límite → handoff | S3.4: `delivery/pos/**`, `delivery/sinks/pos-order.sink(.spec).ts`, `test/utils/fake-pos.adapter.ts` | S3.3: `delivery/agent/tools/confirm.tools.ts` (resumen_pedido, confirmar_pedido), `presenters/order-summary.presenter.ts`, resto de `delivery/sinks/**`, `presenters/kitchen-ticket.presenter.ts`, registro de `ORDER_SINKS`/`POS_ADAPTERS` en `delivery.module.ts`, `test/delivery-checkout.e2e-spec.ts` |
| F4 | `delivery/lifecycle/**`, delegación en merchant-command legacy, `test/delivery-lifecycle.e2e-spec.ts` | `delivery/agent/tools/order.tools.ts`, `test/delivery-customer.e2e-spec.ts` | `delivery/commands/**` (stock, tienda, reporte) | integración + resolución de conflictos |
| F5 | S5.1: `channels/whatsapp/*` (debounce, después de S5.0) + `delivery/burst/**` | S5.2: `delivery/media/transcriber*`, casos de voz en `test/delivery-media.e2e-spec.ts` | S5.3: `delivery/media/image-interpreter*`, `delivery/media/receipt*`, `delivery/media/product-photo*`, casos de imagen en el e2e; luego S5.4 interactive | S5.0: `delivery/media/media-fetcher*`, `media-router*`, `test/utils/fake-media.ts`, propagación en `OrchestratorInput`/mapper; S5.5 |

**Regla de conflicto:** si dos tracks necesitan el mismo archivo, el segundo se **serializa**: espera el merge del primero y rebasea. No se edita en paralelo.

## 4. Brief estándar para un subagente (lo genera el Orquestador)
```
Eres el implementador del Track {X} = slice {S#} "{nombre}" del Closy Delivery Agent.
Repo: worktree {path} en la rama da/{S#}-{slug} (creada desde feat/delivery-agent@{sha}).
Lee: docs/delivery-agent/SPEC.md (§ relevantes: …), CONTRACTS.md §1 y apps/api/src/verticals/delivery/CLAUDE.md.
Implementa SOLO las tareas {T1..Tn} de IMPLEMENTATION-PLAN.md §{S#}, en ese orden, un commit por tarea (≤ 400 líneas).
Archivos que puedes tocar: {lista de §3}. Cualquier otro archivo → detente y repórtalo.
No cambies contracts.ts. Si el contrato no te alcanza, devuelve una propuesta y no la implementes.
Antes de cada commit: tsc --noEmit, lint de tus archivos y jest de tus specs, todo en verde.
NO hagas push ni abras PRs. Al terminar devuelve: commits (sha + mensaje + líneas), tests añadidos, AC cubiertos con nombre de test, decisiones Tier 1 tomadas y bloqueos.
```
