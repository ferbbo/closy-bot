/**
 * Closy Delivery Agent — contratos congelados.
 *
 * COPIA LITERAL de docs/delivery-agent/CONTRACTS.md §1 (congelada en S1.1-T3).
 * Cambiar un contrato es Tier 2: solo el Integrador, con registro en DECISIONS.md.
 */
/* eslint-disable prettier/prettier, @typescript-eslint/ban-types -- copia literal de CONTRACTS.md §1; se mantiene el formato del documento */

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
// Herramientas del agente (nombres estables): buscar_producto, ver_menu, consultar_negocio, agregar_al_carrito, quitar_del_carrito, ver_carrito,
// fijar_entrega, cotizar_domicilio, fijar_pago, resumen_pedido, confirmar_pedido, estado_pedido, cancelar_pedido, repetir_pedido, pedir_humano,
// (P1) ver_foto_producto. TODAS leen de la BD en el turno (RN-00); ninguna devuelve datos de defaults de código, memoria o caché.

// ===== Información del negocio (S2.1-T4) — RN-00 =================
export type BusinessTopic = 'faq' | 'politicas' | 'horario' | 'zonas' | 'pagos' | 'todo';
export interface BusinessInfo {                    // lo que no esté en la BD va como null explícito
  merchantName: string;
  faqs: Array<{ question: string; answer: string }> | null;
  policies: { returns: string | null; delivery: string | null; privacyUrl: string | null };
  hours: { openNow: boolean; nextOpening: { day: number; time: string } | null; windows: OpeningWindow[] } | null;
  zones: Array<{ name: string; fee: number; minOrder: number; etaMinutes: number }> | null;
  payments: Array<{ type: string; label: string; instructions: string | null }> | null; // literal de MerchantConfig.paymentMethods
  pickupEnabled: boolean | null;
}
export interface CommercialCompleteness { complete: boolean; missing: Array<'zones' | 'openingHours' | 'prepTimeMinutes' | 'paymentMethods'> }

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

// ===== Meta Sandbox (S1.5) — solo tests y demo local =============
// apps/api/test/meta-sandbox/
export const SANDBOX_APP = {
  appId: 'sandbox-app-id', appSecret: 'sandbox-app-secret', wabaId: 'sandbox-waba-id',
  phoneNumberId: 'sandbox-phone-number-id', accessToken: 'sandbox-access-token', verifyToken: 'sandbox-verify-token',
  apiVersion: 'v21.0', merchantPhone: '+573000000001', customers: ['+573000000101', '+573000000102', '+573000000103'],
} as const;
export interface FakeGraphApi {
  start(): Promise<{ baseUrl: string }>; stop(): Promise<void>; reset(): void;
  sent(): Array<{ to: string; type: 'text' | 'template' | 'interactive'; payload: unknown; at: Date }>;
  registeredTemplates(): Array<{ name: string; language: string; category: string; status: string }>;
  failNext(endpoint: 'messages' | 'media' | 'templates', error: { httpStatus: number; code: number; message: string }): void;
  putMedia(mediaId: string, file: { buffer: Buffer; mimeType: string }): void;
}
// webhook-builders.ts: inboundText(from, text) · inboundAudio(from, mediaId) · inboundImage(from, mediaId, caption?) · buttonReply(from, id, title)
//                      templateStatusUpdate(name, status) · templateCategoryUpdate(name, prev, next) · phoneQualityUpdate(level)
//                      signPayload(rawBody: string, appSecret: string): string  // 'sha256=…'

// ===== Utilidades de prueba (S1.3) ================================
// apps/api/test/utils/fake-llm.provider.ts
// new FakeLlmProvider([{ toolCalls: [{ name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } }] }, { text: 'Listo' }])
