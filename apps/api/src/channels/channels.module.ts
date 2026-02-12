import { Module } from '@nestjs/common';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

/**
 * Channels Module
 *
 * Handles message ingestion and normalization from different channels (WhatsApp, etc.)
 *
 * Current features (Core V1 MVP):
 * - WhatsApp webhook receiver with idempotency
 * - Message normalization to common format
 *
 * Future responsibilities:
 * - Outbound message sending
 * - Additional channels (Instagram, web chat)
 */
@Module({
  imports: [WhatsAppModule],
  exports: [WhatsAppModule],
})
export class ChannelsModule {}
