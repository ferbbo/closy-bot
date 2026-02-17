import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MessageLogCleanupService } from './message-log-cleanup.service';

/**
 * Retention Module (PR-03.10)
 * Handles message log cleanup jobs
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MessageLogCleanupService],
  exports: [MessageLogCleanupService],
})
export class RetentionModule {}
