import { Module } from '@nestjs/common';
import { ConversationOrchestrator } from './conversation.orchestrator';
import { IntentRouterService } from './intent/intent-router.service';
import { RouteDecisionService } from './route-decision.service'; // PR-03.5.1
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { AddToCartFlow } from './flows/add-to-cart.flow'; // PR-04
import { ViewCartFlow } from './flows/view-cart.flow'; // PR-04
import { UpdateCartItemFlow } from './flows/update-cart-item.flow'; // PR-04
import { RemoveFromCartFlow } from './flows/remove-from-cart.flow'; // PR-04
import { FaqFlow } from './flows/faq.flow'; // PR-GAP-2
import { ServicesModule } from '../services/services.module';
import { LlmModule } from '../llm/llm.module';
import { PersistenceModule } from '../persistence/persistence.module'; // PR-03.10
import { CommonModule } from '../common/common.module'; // PR-03.10 AC-06

/**
 * Orchestrator Module
 *
 * Handles conversation flow orchestration and intent classification.
 *
 * Responsibilities:
 * - Intent classification (IntentRouter V2 - PR-03.5.1)
 * - Route decision (RouteDecisionService - PR-03.5.1)
 * - Flow execution (greeting, help, search, cart - PR-04)
 * - Merchant and customer resolution
 * - Conversation orchestration
 * - LLM-powered responses (when enabled)
 *
 * PR-11: Removed PlaybookService (now imported via ServicesModule in P2 fix)
 * PR-03.10: Imports PersistenceModule and CommonModule for conversation memory
 * PR-04: Added 4 separate cart flows (AC-07, AC-08, AC-09, AC-10)
 * PR-03.5.1: Added RouteDecisionService for template-first routing
 */
@Module({
  imports: [ServicesModule, LlmModule, PersistenceModule, CommonModule],
  providers: [
    ConversationOrchestrator,
    IntentRouterService,
    RouteDecisionService, // PR-03.5.1
    SearchCatalogFlow,
    GreetingFlow,
    HelpFlow,
    AddToCartFlow, // PR-04 AC-07
    ViewCartFlow, // PR-04 AC-08
    UpdateCartItemFlow, // PR-04 AC-09
    RemoveFromCartFlow, // PR-04 AC-10
    FaqFlow, // PR-GAP-2 AC-05
  ],
  exports: [ConversationOrchestrator],
})
export class OrchestratorModule {}
