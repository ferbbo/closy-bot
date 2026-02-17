import { Module } from '@nestjs/common';
import { MessageLogCleanupService } from './message-log-cleanup.service';

/**
 * Retention Module (PR-03.10)
 * Handles message log cleanup jobs
 * Note: ScheduleModule.forRoot() is imported in AppModule
 */
@Module({
  providers: [MessageLogCleanupService],
  exports: [MessageLogCleanupService],
})
export class RetentionModule {}
