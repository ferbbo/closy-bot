import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule'; // PR-03.10: Centralized scheduler
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
import { AuthModule } from './auth/auth.module'; // PR-12

@Module({
  imports: [
    ScheduleModule.forRoot(), // PR-03.10: Single scheduler instance for all workers
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
    AuthModule, // PR-12: OIDC Authentication
  ],
})
export class AppModule {}
