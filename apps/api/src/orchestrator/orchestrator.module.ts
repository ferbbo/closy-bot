import { Module } from '@nestjs/common';
import { ConversationOrchestrator } from './conversation.orchestrator';
import { IntentRouterService } from './intent/intent-router.service';
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { ServicesModule } from '../services/services.module';
import { LlmModule } from '../llm/llm.module';

/**
 * Orchestrator Module
 *
 * Handles conversation flow orchestration and intent classification.
 *
 * Responsibilities:
 * - Intent classification (keyword-based for MVP)
 * - Flow execution (greeting, help, search)
 * - Merchant and customer resolution
 * - Conversation orchestration
 * - LLM-powered responses (when enabled)
 *
 * PR-11: Removed PlaybookService (now imported via ServicesModule in P2 fix)
 */
@Module({
  imports: [ServicesModule, LlmModule],
  providers: [
    ConversationOrchestrator,
    IntentRouterService,
    SearchCatalogFlow,
    GreetingFlow,
    HelpFlow,
  ],
  exports: [ConversationOrchestrator],
})
export class OrchestratorModule {}
