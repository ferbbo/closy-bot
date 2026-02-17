import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';
import { MemoryConfigService } from '../../common/config/memory-config.service'; // PR-03.10 AC-06

/**
 * Message Log Cleanup Service (PR-03.10 REQ-03)
 *
 * Periodically cleans up expired message logs using two strategies:
 * 1. Delete logs with expiresAt < now() (TTL-based)
 * 2. Apply per-conversation cap (delete oldest beyond MAX_PER_CONVO)
 *
 * Runs as a cron job to prevent unbounded DB growth.
 */
@Injectable()
export class MessageLogCleanupService {
  private readonly logger = new Logger(MessageLogCleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly memoryConfigService: MemoryConfigService, // PR-03.10 AC-06
  ) {}

  /**
   * Cron job: Cleanup expired messages
   * Runs every day at 3:00 AM (low-traffic hours)
   * AC-03: Job de cleanup elimina logs expirados + aplica cap por conversación
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredMessages() {
    this.logger.log('Starting cleanup of expired message logs...');

    try {
      // 1. Delete expired messages (TTL-based)
      const deletedCount = await this.messageLogRepository.deleteExpired();
      this.logger.log(`Deleted ${deletedCount} expired message logs`);

      // 2. Apply cap per conversation (REQ-03, AC-03)
      // AC-06: Use default cap (per-merchant cap would require iterating merchants)
      const maxPerConvo = this.memoryConfigService.getMessageHistoryMaxPerConvo();
      const conversationsWithCounts =
        await this.messageLogRepository.findConversationsExceedingCap(maxPerConvo);

      let capDeletedTotal = 0;
      for (const { conversationId } of conversationsWithCounts) {
        const capDeleted = await this.messageLogRepository.deleteOldestBeyondCap(
          conversationId,
          maxPerConvo,
        );
        capDeletedTotal += capDeleted;
      }

      if (capDeletedTotal > 0) {
        this.logger.log(
          `Deleted ${capDeletedTotal} messages beyond cap (${maxPerConvo} per conversation)`,
        );
      }

      this.logger.log('Cleanup completed successfully');
    } catch (error) {
      this.logger.error('Cleanup failed', error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Manual trigger for cleanup (useful for testing or on-demand cleanup)
   */
  async triggerCleanup(): Promise<{ deletedCount: number }> {
    this.logger.log('Manual cleanup triggered');
    const deletedCount = await this.messageLogRepository.deleteExpired();
    return { deletedCount };
  }
}
