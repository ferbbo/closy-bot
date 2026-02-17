import { Module } from '@nestjs/common';
import { MessageLogCleanupService } from './message-log-cleanup.service';
import { PersistenceModule } from '../../persistence/persistence.module';
import { CommonModule } from '../../common/common.module';

/**
 * Retention Module (PR-03.10)
 * Handles message log cleanup jobs
 * Note: ScheduleModule.forRoot() is imported in AppModule
 */
@Module({
  imports: [PersistenceModule, CommonModule], // PR-03.10 AC-06
  providers: [MessageLogCleanupService],
  exports: [MessageLogCleanupService],
})
export class RetentionModule {}
