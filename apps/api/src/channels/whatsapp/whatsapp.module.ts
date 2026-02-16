import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { PersistenceModule } from '../../persistence/persistence.module';
import { OrchestratorModule } from '../../orchestrator/orchestrator.module';
import { MetaSignatureGuard } from './guards/meta-signature.guard';

/**
 * WhatsApp channel module
 * Handles webhook processing with idempotency guarantees,
 * Meta signature validation, and outbound message sending
 */
@Module({
  imports: [PersistenceModule, OrchestratorModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppOutboundService, MetaSignatureGuard],
  exports: [WhatsAppService, WhatsAppOutboundService],
})
export class WhatsAppModule {}
