import { Module } from '@nestjs/common';
import { PaymentWebhookController } from './payment-webhook.controller';
import { ServicesModule } from '../../services/services.module';

/**
 * WebhooksModule
 * PR-06: Payments — payment webhook endpoint
 *
 * Contains public webhook endpoints for external integrations.
 * PersistenceModule is @Global so PaymentRepository is available via ServicesModule deps.
 */
@Module({
  imports: [ServicesModule],
  controllers: [PaymentWebhookController],
})
export class WebhooksModule {}
