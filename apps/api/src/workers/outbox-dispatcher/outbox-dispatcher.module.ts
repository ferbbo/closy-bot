import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { ChannelsModule } from '../../channels/channels.module';

/**
 * Module for outbox dispatcher worker
 * Processes pending outbound messages via scheduled cron jobs
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ChannelsModule, // For WhatsAppOutboundService
  ],
  providers: [OutboxDispatcherService],
  exports: [OutboxDispatcherService],
})
export class OutboxDispatcherModule {}
