import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxMessage, OutboxMessageStatus, Prisma } from '@prisma/client';

/**
 * Repository for OutboxMessage entities
 * Handles raw SQL for SKIP LOCKED pattern (not supported natively by Prisma)
 */
@Injectable()
export class OutboxRepository {
  private readonly logger = new Logger(OutboxRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new outbox message
   * On conflict (duplicate dedupeKey), returns existing message
   */
  async create(data: Prisma.OutboxMessageCreateInput): Promise<OutboxMessage> {
    try {
      return await this.prisma.outboxMessage.create({ data });
    } catch (error) {
      // Handle unique constraint violation on (merchantId, dedupeKey)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Duplicate dedupeKey detected, returning existing message`);
        // Find and return existing message
        const merchantConnect = data.merchant as { connect: { id: string } };
        const existing = await this.prisma.outboxMessage.findUnique({
          where: {
            merchantId_dedupeKey: {
              merchantId: merchantConnect.connect.id,
              dedupeKey: data.dedupeKey!,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Claim a batch of pending/failed messages for processing
   * Uses FOR UPDATE SKIP LOCKED to prevent duplicate processing
   *
   * @param batchSize Maximum number of messages to claim
   * @param lockId Unique identifier for this worker instance
   * @param lockTtlSeconds TTL for lock (to reclaim stuck messages)
   * @param maxAttempts Maximum retry attempts (messages with attempts >= maxAttempts are excluded)
   * @returns Array of claimed messages
   */
  async claimBatch(
    batchSize: number,
    lockId: string,
    lockTtlSeconds: number,
    maxAttempts: number,
  ): Promise<OutboxMessage[]> {
    const now = new Date();
    const lockExpired = new Date(now.getTime() - lockTtlSeconds * 1000);

    // Raw SQL for SKIP LOCKED
    const messages = await this.prisma.$queryRaw<OutboxMessage[]>`
      UPDATE outbox_messages
      SET 
        status = 'SENDING'::"OutboxMessageStatus",
        locked_at = ${now},
        locked_by = ${lockId},
        updated_at = ${now}
      WHERE id IN (
        SELECT id FROM outbox_messages
        WHERE (status = 'PENDING'::"OutboxMessageStatus" OR status = 'FAILED'::"OutboxMessageStatus")
          AND next_retry_at <= ${now}          AND attempts < ${maxAttempts}          AND (locked_at IS NULL OR locked_at < ${lockExpired})
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `;

    this.logger.debug(`Claimed ${messages.length} message(s) with lockId=${lockId}`);
    return messages;
  }

  /**
   * Mark a message as successfully sent
   */
  async markSent(id: string, providerMessageId: string): Promise<OutboxMessage> {
    return this.prisma.outboxMessage.update({
      where: { id },
      data: {
        status: OutboxMessageStatus.SENT,
        providerMessageId,
        sentAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  /**
   * Mark a message as failed and schedule retry with exponential backoff
   *
   * @param id Message ID
   * @param error Error message
   * @param maxAttempts Maximum retry attempts before giving up
   * @param baseDelaySeconds Base delay for exponential backoff
   */
  async markFailed(
    id: string,
    error: string,
    maxAttempts: number,
    baseDelaySeconds: number = 60,
  ): Promise<OutboxMessage> {
    const message = await this.prisma.outboxMessage.findUnique({
      where: { id },
      select: { attempts: true },
    });

    if (!message) {
      throw new Error(`OutboxMessage ${id} not found`);
    }

    const newAttempts = message.attempts + 1;
    const shouldRetry = newAttempts < maxAttempts;

    // Exponential backoff: 60s, 120s, 240s, ...
    // Cap at 1 hour
    const delaySeconds = Math.min(baseDelaySeconds * Math.pow(2, newAttempts - 1), 3600);
    const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

    return this.prisma.outboxMessage.update({
      where: { id },
      data: {
        status: OutboxMessageStatus.FAILED,
        attempts: newAttempts,
        lastError: error.substring(0, 1000), // Truncate to prevent huge logs
        nextRetryAt: shouldRetry ? nextRetryAt : undefined,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Find messages by status (for monitoring/debugging)
   */
  async findByStatus(status: OutboxMessageStatus, limit: number = 100): Promise<OutboxMessage[]> {
    return this.prisma.outboxMessage.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
