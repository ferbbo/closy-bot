import { Module } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { ChannelsModule } from '../../channels/channels.module';
import { PersistenceModule } from '../../persistence/persistence.module';

/**
 * Module for outbox dispatcher worker
 * Processes pending outbound messages via scheduled cron jobs
 * Note: ScheduleModule.forRoot() is imported in AppModule (single instance)
 */
@Module({
  imports: [
    ChannelsModule, // For WhatsAppOutboundService
    PersistenceModule, // For MessageLogRepository
  ],
  providers: [OutboxDispatcherService],
  exports: [OutboxDispatcherService],
})
export class OutboxDispatcherModule {}
