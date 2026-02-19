import { Module } from '@nestjs/common';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { ChannelHealthController } from './channel-health.controller';
import { ChannelHealthService } from './channel-health.service';
import { ChannelListService } from './channel-list.service';
import { ChannelOwnershipGuard } from './guards/channel-ownership.guard';
import { PersistenceModule } from '../persistence/persistence.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AuthModule } from '../auth/auth.module'; // PR-14: For SessionAuthGuard

/**
 * Channels Module
 *
 * Handles message ingestion and normalization from different channels (WhatsApp, etc.)
 *
 * Current features (Core V1 MVP):
 * - WhatsApp webhook receiver with idempotency
 * - Message normalization to common format
 * - PR-14: Channel health diagnostics and recovery operations
 * - PR-16: Channel list API for merchant dashboard
 *
 * Future responsibilities:
 * - Outbound message sending
 * - Additional channels (Instagram, web chat)
 */
@Module({
  imports: [WhatsAppModule, PersistenceModule, OnboardingModule, AuthModule],
  controllers: [ChannelHealthController],
  providers: [ChannelHealthService, ChannelListService, ChannelOwnershipGuard],
  exports: [WhatsAppModule, ChannelHealthService],
})
export class ChannelsModule {}
