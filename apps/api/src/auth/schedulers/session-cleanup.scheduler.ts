import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionService } from '../session/session.service';

/**
 * Session Cleanup Scheduler
 * Periodically removes expired sessions from database
 */
@Injectable()
export class SessionCleanupScheduler {
  private readonly logger = new Logger(SessionCleanupScheduler.name);

  constructor(private readonly sessionService: SessionService) {}

  /**
   * Run cleanup every 6 hours
   * Configurable via AUTH_SESSION_CLEANUP_CRON env var
   */
  @Cron(process.env.AUTH_SESSION_CLEANUP_CRON || CronExpression.EVERY_6_HOURS)
  async handleSessionCleanup() {
    this.logger.log('Starting session cleanup job');

    try {
      const deletedCount = await this.sessionService.cleanupExpired();
      this.logger.log(`Session cleanup completed: ${deletedCount} sessions removed`);
    } catch (error) {
      this.logger.error('Session cleanup job failed', error);
    }
  }
}
