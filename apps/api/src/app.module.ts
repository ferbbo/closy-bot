import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ChannelsModule } from './channels/channels.module';
import { DomainModule } from './domain/domain.module';
import { ServicesModule } from './services/services.module';
import { PersistenceModule } from './persistence/persistence.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    CommonModule,
    PersistenceModule,
    ChannelsModule,
    DomainModule,
    ServicesModule,
    LlmModule,
    OrchestratorModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
