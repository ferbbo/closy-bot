import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Channel } from '../../../domain/entities/conversation.entity';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { OutboxService } from '../../../persistence/outbox/outbox.service';
import { CustomerService } from '../../../services/customer.service';
import { ConversationService } from '../../../services/conversation.service';
import { ConversationOrchestrator } from '../../../orchestrator/conversation.orchestrator';

/** Un texto del cliente pendiente de procesar (nunca media: RN-24). */
export interface BurstMessage {
  messageId: string;
  text: string;
  at: string; // ISO
}

/** `Conversation.metadata.pendingBurst` (S5.1, F-15). */
export interface PendingBurst {
  messages: BurstMessage[];
  dueAt: string; // ISO: fin de la ventana, re-armado con cada mensaje
  merchantId: string;
  channelId: string;
  receiverPhoneId: string;
}

/** Referencia al remitente/canal ya resuelta por el controlador del webhook. */
export interface BurstRef {
  from: string;
  receiverPhoneId: string;
  merchantId: string;
  channelId: string;
}

export interface BurstInbound extends BurstRef {
  messageId: string;
  text: string;
  timestamp: Date;
}

export const DEFAULT_DEBOUNCE_MS = 4000;

/**
 * S5.1 · Debounce de ráfagas (F-15, AC-25).
 *
 * El webhook registra el inbound (dedupe por `message_id`) y llama a `enqueue`: el texto se
 * agrega a `Conversation.metadata.pendingBurst` con una escritura atómica y se re-arma un
 * timeout por conversación. Al vencer la ventana, `flush` reclama el buffer con un
 * compare-and-set (lo lee y lo borra en la misma sentencia) y solo entonces llama al
 * orquestador UNA vez con los textos unidos por "\n". El barrido (`DeliveryBurstSweeper`)
 * procesa los buffers vencidos que quedaron persistidos (p. ej. tras un reinicio).
 */
@Injectable()
export class BurstBufferService implements OnModuleDestroy {
  private readonly logger = new Logger(BurstBufferService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly customers: CustomerService,
    private readonly conversations: ConversationService,
    private readonly outbox: OutboxService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Ventana en ms; 0 (o valor inválido negativo) = debounce desactivado. */
  get windowMs(): number {
    const raw: unknown = this.config.get('DELIVERY_DEBOUNCE_MS');
    const value = Number(raw ?? DEFAULT_DEBOUNCE_MS);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  isEnabled(): boolean {
    return this.windowMs > 0;
  }

  /** Agrega un texto al buffer de su conversación y re-arma la ventana. */
  async enqueue(input: BurstInbound): Promise<void> {
    const windowMs = this.windowMs;
    const conversationId = await this.resolveConversationId(input);
    const dueAt = new Date(Date.now() + windowMs).toISOString();
    const message: BurstMessage = {
      messageId: input.messageId,
      text: input.text,
      at: input.timestamp.toISOString(),
    };
    await this.prisma.$executeRaw`
      UPDATE conversations SET metadata = jsonb_set(
        CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END,
        '{pendingBurst}',
        jsonb_build_object(
          'messages', COALESCE(metadata->'pendingBurst'->'messages', '[]'::jsonb) || ${JSON.stringify([message])}::jsonb,
          'dueAt', ${dueAt}::text,
          'merchantId', ${input.merchantId}::text,
          'channelId', ${input.channelId}::text,
          'receiverPhoneId', ${input.receiverPhoneId}::text
        ),
        true
      ), updated_at = NOW()
      WHERE id = ${conversationId}`;
    this.arm(conversationId, windowMs);
    this.logger.debug(`Burst buffered: conversation=${conversationId}, message=${input.messageId}`);
  }

  /** Procesa ya lo pendiente (antes de un turno de media). No crea nada si no hay buffer. */
  async flushPending(ref: BurstRef): Promise<void> {
    const conversationId = await this.resolveConversationId(ref);
    await this.flush(conversationId, true);
  }

  /**
   * Reclama y procesa el buffer de una conversación. Serializado por conversación dentro del
   * proceso; entre procesos/barrido, el compare-and-set garantiza un único procesamiento.
   * @param force true = ignora `dueAt` (flush por media)
   * @returns true si se procesó un turno
   */
  flush(conversationId: string, force = false): Promise<boolean> {
    const previous = this.chains.get(conversationId) ?? Promise.resolve();
    const run = previous.then(() => this.claimAndRun(conversationId, force));
    const tail = run.catch(() => false);
    this.chains.set(conversationId, tail);
    void tail.then(() => {
      if (this.chains.get(conversationId) === tail) this.chains.delete(conversationId);
    });
    return run;
  }

  /** Ids de conversaciones con buffer vencido (para el barrido). */
  async findDue(now: Date = new Date(), limit = 100): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM conversations
      WHERE metadata->'pendingBurst' IS NOT NULL
        AND (metadata->'pendingBurst'->>'dueAt')::timestamptz <= ${now.toISOString()}::timestamptz
      ORDER BY updated_at ASC
      LIMIT ${Number(limit)}`;
    return rows.map((r) => r.id);
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private arm(conversationId: string, windowMs: number): void {
    const existing = this.timers.get(conversationId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(conversationId);
      void this.flush(conversationId, false);
    }, windowMs);
    this.timers.set(conversationId, timer);
  }

  private async claimAndRun(conversationId: string, force: boolean): Promise<boolean> {
    try {
      const burst = await this.claim(conversationId, force);
      if (!burst) return false;
      const timer = this.timers.get(conversationId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(conversationId);
      }
      await this.runTurn(conversationId, burst);
      return true;
    } catch (error) {
      this.logger.error(
        `Burst flush failed for conversation ${conversationId}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /** Compare-and-set: lee y borra `pendingBurst` en una sola sentencia (FOR UPDATE). */
  private async claim(conversationId: string, force: boolean): Promise<PendingBurst | null> {
    // Tolerancia mínima por si el timer dispara unos ms antes que el reloj de la BD
    const now = new Date(Date.now() + 50).toISOString();
    const rows = await this.prisma.$queryRaw<Array<{ burst: PendingBurst | null }>>`
      WITH claimed AS (
        SELECT id, metadata->'pendingBurst' AS burst FROM conversations
        WHERE id = ${conversationId}
          AND metadata->'pendingBurst' IS NOT NULL
          AND (${force}::boolean OR (metadata->'pendingBurst'->>'dueAt')::timestamptz <= ${now}::timestamptz)
        FOR UPDATE
      )
      UPDATE conversations c SET metadata = c.metadata - 'pendingBurst', updated_at = NOW()
      FROM claimed WHERE c.id = claimed.id
      RETURNING claimed.burst AS burst`;
    const burst = rows[0]?.burst;
    return burst && Array.isArray(burst.messages) && burst.messages.length > 0 ? burst : null;
  }

  private async runTurn(conversationId: string, burst: PendingBurst): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { customer: { select: { phone: true } } },
    });
    if (!conversation) return;
    const from = conversation.customer.phone;
    const last = burst.messages[burst.messages.length - 1];
    const orchestrator = this.moduleRef.get(ConversationOrchestrator, { strict: false });
    const result = await orchestrator.process({
      messageId: last.messageId,
      from,
      receiverPhoneId: burst.receiverPhoneId,
      merchantId: burst.merchantId,
      channelId: burst.channelId,
      text: burst.messages.map((m) => m.text).join('\n'),
      timestamp: new Date(last.at),
    });
    this.logger.log(
      `Burst processed: conversation=${conversationId}, messages=${burst.messages.length}, intent=${result.intent}`,
    );
    if (result.shouldSend) {
      await this.outbox.enqueueWhatsAppText({
        merchantId: result.merchantId,
        conversationId: result.conversationId,
        channelId: burst.channelId,
        to: from,
        text: result.response,
        dedupeKey: `reply:${last.messageId}`,
      });
    }
  }

  private async resolveConversationId(ref: BurstRef): Promise<string> {
    const customer = await this.customers.resolveByPhone(ref.from);
    const conversation = await this.conversations.getOrCreateConversation(
      customer.id,
      ref.merchantId,
      Channel.WHATSAPP,
      ref.channelId,
    );
    return conversation.id;
  }
}
