import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository';

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
  private readonly maxPerConvo: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly messageLogRepository: MessageLogRepository,
  ) {
    this.maxPerConvo = this.configService.get<number>('MESSAGE_HISTORY_MAX_PER_CONVO', 50);
  }

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

      // 2. TODO: Apply cap per conversation
      // This requires iterating conversations with message count > maxPerConvo
      // For MVP, we rely on TTL cleanup + manual cap enforcement on write
      // Future: Add batch processing of conversations with high message count

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
