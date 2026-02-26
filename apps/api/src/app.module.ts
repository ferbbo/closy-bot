import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule'; // PR-03.10: Centralized scheduler
import { ThrottlerModule } from '@nestjs/throttler'; // PR-13: Rate limiting
import { CommonModule } from './common/common.module';
import { ChannelsModule } from './channels/channels.module';
import { DomainModule } from './domain/domain.module';
import { ServicesModule } from './services/services.module';
import { PersistenceModule } from './persistence/persistence.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { LlmModule } from './llm/llm.module';
import { CatalogManagementModule } from './catalog-management/catalog-management.module';
import { OutboxDispatcherModule } from './workers/outbox-dispatcher/outbox-dispatcher.module';
import { RetentionModule } from './workers/retention/retention.module'; // PR-03.10
import { SummarizationModule } from './workers/summarization/summarization.module'; // PR-03.10
import { CartCleanupModule } from './workers/cart-cleanup/cart-cleanup.module'; // PR-04
import { AuthModule } from './auth/auth.module'; // PR-12
import { OnboardingModule } from './onboarding/onboarding.module'; // PR-13
import { MerchantSettingsModule } from './merchant-settings/merchant-settings.module'; // PR-15
import { FeatureFlagsModule } from './common/feature-flags/feature-flags.module'; // PR-MVP-01
import { OrdersModule } from './orders/orders.module'; // PR-FE-06

@Module({
  imports: [
    ScheduleModule.forRoot(), // PR-03.10: Single scheduler instance for all workers
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // Default: 10 requests per 60 seconds
      },
    ]), // PR-13: Basic rate limiting for retry endpoints
    CommonModule,
    PersistenceModule,
    ChannelsModule,
    DomainModule,
    ServicesModule,
    LlmModule,
    OrchestratorModule,
    AnalyticsModule,
    CatalogManagementModule,
    OutboxDispatcherModule,
    RetentionModule, // PR-03.10
    SummarizationModule, // PR-03.10
    CartCleanupModule, // PR-04: Cart expiration cleanup
    AuthModule, // PR-12: OIDC Authentication
    OnboardingModule, // PR-13: Meta Embedded Signup
    MerchantSettingsModule, // PR-15: Merchant Settings API
    FeatureFlagsModule, // PR-MVP-01: Feature flags infrastructure
    OrdersModule, // PR-FE-06: Dashboard Orders UI
  ],
})
export class AppModule {}
