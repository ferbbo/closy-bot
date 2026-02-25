/**
 * HandoffService
 * PR-08: Human handoff with structured summary
 *
 * REQ-02: detectHandoff(), createHandoff(), generateSummary(), updateStatus()
 * REQ-04: Auto-escalation detection (3+ consecutive UNKNOWN intents)
 * REQ-05: Deterministic summary from DB
 * REQ-06: LLM-assisted summary (opt-in via LLM_SUMMARY_ENABLED)
 * REQ-07: Merchant notification via WhatsApp outbox
 * REQ-08: Activate handoffActive=true on Conversation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HandoffStatus, OutboxChannel, OutboxMessageType } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { LlmService } from '../llm/llm.service';
import { PlaybookService } from './playbook.service';
import type { MerchantPlaybookData } from './playbook.service';
import type { Handoff } from '@prisma/client';

// ---------------------------------------------------------------------------
// HandoffSummary — structured summary attached to each Handoff record
// ---------------------------------------------------------------------------
export interface HandoffSummaryCartItem {
  productName: string;
  qty: number;
  price: string;
}

export interface HandoffSummaryCustomerInfo {
  name?: string;
  phone: string;
}

export interface HandoffSummary {
  intent: string;
  cartSnapshot: HandoffSummaryCartItem[];
  currentStep: string | null;
  customerInfo: HandoffSummaryCustomerInfo;
  conversationHighlights: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal context types
// ---------------------------------------------------------------------------
export interface HandoffContext {
  conversationId: string;
  customerId: string;
  merchantId: string;
  merchant: MerchantPlaybookData;
  /** Current active cart ID if known */
  activeCartId?: string;
}

@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);
  private readonly llmSummaryEnabled: boolean;
  private readonly llmSummaryTimeoutMs = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepository: OutboxRepository,
    private readonly llmService: LlmService,
    private readonly playbookService: PlaybookService,
    private readonly configService: ConfigService,
  ) {
    this.llmSummaryEnabled = this.configService.get<boolean>('LLM_SUMMARY_ENABLED', false);
    this.logger.log(`HandoffService initialized — LLM_SUMMARY_ENABLED=${this.llmSummaryEnabled}`);
  }

  // ---------------------------------------------------------------------------
  // REQ-02, AC-02: detectHandoff — keyword match (delegates to IntentRouter result)
  // The orchestrator already resolved intent=HANDOFF from keyword scoring,
  // so this method checks: keyword intent match OR escalation counter >= 3
  // ---------------------------------------------------------------------------

  /**
   * AC-02: Returns true if messageText matches HANDOFF intent keywords
   * AC-03: Returns true if unknownLoopCount >= 3 (auto-escalation)
   *
   * @param intent - Resolved intent from IntentRouter
   * @param unknownLoopCount - Consecutive UNKNOWN intent counter
   */
  detectHandoff(intent: string, unknownLoopCount: number): boolean {
    if (intent === 'HANDOFF') {
      this.logger.debug('HandoffService.detectHandoff: keyword match → true');
      return true;
    }
    if (unknownLoopCount >= 3) {
      this.logger.debug(
        `HandoffService.detectHandoff: escalation threshold reached (${unknownLoopCount}) → true`,
      );
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // REQ-02, AC-04: createHandoff — idempotent, activates handoffActive, notifies
  // ---------------------------------------------------------------------------

  /**
   * AC-04, AC-10, AC-14:
   * Creates Handoff record + sets conversation.handoffActive=true + notifies merchant.
   * Idempotent: if pending/active handoff already exists for conversation → returns existing.
   *
   * @param ctx - Handoff context (conversationId, customerId, merchantId, merchant)
   * @param reason - "user_request" | "auto_escalation"
   */
  async createHandoff(
    ctx: HandoffContext,
    reason: 'user_request' | 'auto_escalation',
  ): Promise<Handoff> {
    // AC-14: Idempotency — check for existing pending/active handoff
    const existing = await this.prisma.handoff.findFirst({
      where: {
        conversationId: ctx.conversationId,
        status: { in: [HandoffStatus.pending, HandoffStatus.active] },
      },
    });

    if (existing) {
      this.logger.log(
        `HandoffService.createHandoff: existing ${existing.status} handoff found for conversation ${ctx.conversationId} — returning existing`,
      );
      return existing;
    }

    // AC-07: Generate deterministic summary (+ optional LLM highlights)
    const summary = await this.generateSummary(ctx);

    // Persist Handoff record
    const handoff = await this.prisma.handoff.create({
      data: {
        conversationId: ctx.conversationId,
        reason,
        summaryJson: summary as object,
        status: HandoffStatus.pending,
      },
    });

    // AC-10: Activate handoffActive on Conversation
    await this.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { handoffActive: true },
    });

    this.logger.log(
      `HandoffService.createHandoff: created handoff=${handoff.id} (reason=${reason}, conversation=${ctx.conversationId})`,
    );

    // AC-09: Notify merchant via WhatsApp outbox
    await this.notifyMerchant(ctx, summary);

    return handoff;
  }

  // ---------------------------------------------------------------------------
  // REQ-02, AC-07, AC-08: generateSummary — deterministic + optional LLM
  // ---------------------------------------------------------------------------

  /**
   * AC-07: Build deterministic summary from DB (intent, cart, step, customer, last 3 messages)
   * AC-08: If LLM_SUMMARY_ENABLED=true, replace conversationHighlights with LLM-generated text
   * AC-15: If LLM fails → fallback to deterministic (no crash)
   */
  async generateSummary(ctx: HandoffContext): Promise<HandoffSummary> {
    // 1. Fetch conversation data
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: ctx.conversationId },
      select: {
        lastIntent: true,
        metadata: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    // 2. Cart snapshot from active cart
    const cartSnapshot = await this.buildCartSnapshot(ctx.customerId, ctx.merchantId);

    // 3. Last 3 messages for highlights
    const lastMessages = await this.prisma.messageLog.findMany({
      where: { conversationId: ctx.conversationId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { direction: true, text: true, createdAt: true },
    });

    // 4. Current step from metadata
    const metadata = (conversation?.metadata as Record<string, unknown> | null) ?? {};
    const currentStep = this.extractCurrentStep(metadata);

    // 5. Customer info (PII: phone only in notification, masked in logs)
    const customerInfo: HandoffSummaryCustomerInfo = {
      name: conversation?.customer?.name ?? undefined,
      phone: conversation?.customer?.phone ?? '',
    };

    // 6. Deterministic conversationHighlights (last 3 messages as plain text)
    const deterministicHighlights = lastMessages
      .reverse()
      .map((m) => `[${m.direction}] ${m.text ?? '(media)'}`)
      .join('\n');

    let conversationHighlights = deterministicHighlights || 'Sin mensajes recientes';

    // AC-08: LLM-assisted highlights (opt-in, with fallback on error/timeout)
    if (this.llmSummaryEnabled) {
      conversationHighlights = await this.generateLlmHighlights(
        deterministicHighlights,
        conversationHighlights,
      );
    }

    return {
      intent: conversation?.lastIntent ?? 'UNKNOWN',
      cartSnapshot,
      currentStep,
      customerInfo,
      conversationHighlights,
      metadata,
    };
  }

  // ---------------------------------------------------------------------------
  // REQ-02: updateStatus — future-proof, updates handoff status
  // ---------------------------------------------------------------------------

  /**
   * Update handoff status (future-proof, not primary V1 flow)
   */
  async updateStatus(handoffId: string, status: HandoffStatus): Promise<Handoff> {
    return this.prisma.handoff.update({
      where: { id: handoffId },
      data: { status },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * AC-07: Build cart snapshot from active cart for customer+merchant
   * Returns [] if no active cart (AC edge case: sin carrito activo)
   */
  private async buildCartSnapshot(
    customerId: string,
    merchantId: string,
  ): Promise<HandoffSummaryCartItem[]> {
    const cart = await this.prisma.cart.findFirst({
      where: { customerId, merchantId, status: 'active' },
      include: {
        items: {
          include: {
            variant: {
              include: { product: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return [];
    }

    return cart.items.map((item) => ({
      productName: item.variant.product.name,
      qty: item.quantity,
      price: `$${Number(item.priceSnapshot).toFixed(0)}`,
    }));
  }

  /**
   * Extract current step from conversation metadata
   * Looks for checkout.step, payment.step, post_sale.step keys
   */
  private extractCurrentStep(metadata: Record<string, unknown>): string | null {
    const checkoutState = metadata['checkoutState'] as Record<string, unknown> | undefined;
    if (checkoutState?.step) return `checkout.${checkoutState.step}`;

    const paymentState = metadata['paymentFallbackState'] as Record<string, unknown> | undefined;
    if (paymentState?.step) return `payment.${paymentState.step}`;

    const postSaleState = metadata['postSaleState'] as Record<string, unknown> | undefined;
    if (postSaleState?.step) return `post_sale.${postSaleState.step}`;

    return null;
  }

  /**
   * AC-08, AC-15: Generate LLM highlights with 5s timeout + fallback
   * Guardrail: LLM only summarizes conversation content, NEVER invents business data
   */
  private async generateLlmHighlights(
    deterministicFallback: string,
    currentHighlights: string,
  ): Promise<string> {
    const prompt = `Eres un asistente de soporte. Resume brevemente (máx 500 caracteres) la siguiente conversación reciente de un cliente que necesita atención humana. Solo resume lo que dice la conversación, no inventes información.

Mensajes recientes:
${deterministicFallback}

Resumen natural:`;

    try {
      const result = await Promise.race([
        this.llmService.generateSimple(prompt, { maxTokens: 150, temperature: 0.3 }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('LLM summary timeout')), this.llmSummaryTimeoutMs),
        ),
      ]);

      if (result && typeof result === 'string') {
        // Truncate to 500 chars max
        return result.slice(0, 500);
      }
      return currentHighlights;
    } catch (error) {
      this.logger.warn(
        `HandoffService: LLM summary failed (${(error as Error).message}), using deterministic fallback`,
      );
      return currentHighlights;
    }
  }

  /**
   * AC-09: Notify merchant via WhatsApp outbox with structured handoff summary
   * Idempotent via dedupeKey = `handoff-{conversationId}-{reason}`
   * If merchant has no phone → log warning + skip (handoff still created)
   */
  private async notifyMerchant(ctx: HandoffContext, summary: HandoffSummary): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: ctx.merchantId },
      select: { id: true, whatsappNumber: true },
    });

    if (!merchant?.whatsappNumber) {
      this.logger.warn(
        `HandoffService.notifyMerchant: merchant ${ctx.merchantId} has no whatsappNumber — skipping notification`,
      );
      return;
    }

    const playbookData = ctx.merchant;
    const playbook = this.playbookService.getPlaybookForMerchant(playbookData);
    const template = playbook.handoffMessages?.merchantNotification ?? DEFAULT_MERCHANT_NOTIFICATION;

    const cartText =
      summary.cartSnapshot.length > 0
        ? summary.cartSnapshot.map((i) => `  - ${i.productName} x${i.qty}: ${i.price}`).join('\n')
        : '  Sin items en carrito';

    const summaryText =
      `Último intent: ${summary.intent}\n` +
      `Paso actual: ${summary.currentStep ?? 'ninguno'}\n` +
      `Carrito:\n${cartText}\n` +
      `Resumen: ${summary.conversationHighlights}`;

    const message = template
      .replace('{customerName}', summary.customerInfo.name ?? summary.customerInfo.phone)
      .replace('{summary}', summaryText);

    const dedupeKey = `handoff-${ctx.conversationId}`;

    await this.outboxRepository.create({
      merchant: { connect: { id: ctx.merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to: merchant.whatsappNumber,
      payloadJson: { text: message },
      dedupeKey,
    });

    this.logger.log(
      `HandoffService.notifyMerchant: notification enqueued for merchant ${ctx.merchantId}`,
    );
  }
}

/** Fallback template when handoffMessages.merchantNotification is not set */
const DEFAULT_MERCHANT_NOTIFICATION =
  '🔔 *Atención requerida*\n\n👤 Cliente: {customerName}\n\n{summary}';
