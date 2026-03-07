import { Module } from '@nestjs/common';
import { ConversationOrchestrator } from './conversation.orchestrator';
import { IntentRouterService } from './intent/intent-router.service';
import { RouteDecisionService } from './route-decision.service'; // PR-03.5.1
import { QueryParserService } from './nlu/query-parser.service'; // PR-SEARCH-NLU
import { SearchCatalogFlow } from './flows/search-catalog.flow';
import { GreetingFlow } from './flows/greeting.flow';
import { HelpFlow } from './flows/help.flow';
import { AddToCartFlow } from './flows/add-to-cart.flow'; // PR-04
import { ViewCartFlow } from './flows/view-cart.flow'; // PR-04
import { UpdateCartItemFlow } from './flows/update-cart-item.flow'; // PR-04
import { RemoveFromCartFlow } from './flows/remove-from-cart.flow'; // PR-04
import { FaqFlow } from './flows/faq.flow'; // PR-GAP-2
import { CheckoutFlow } from './flows/checkout.flow'; // PR-05
import { PaymentFallbackFlow } from './flows/payment-fallback.flow'; // PR-06
import { PostSaleFlow } from './flows/post-sale.flow'; // PR-07
import { HandoffFlow } from './flows/handoff.flow'; // PR-08
import { HandoffService } from '../services/handoff.service'; // PR-08
import { ServicesModule } from '../services/services.module';
import { LlmModule } from '../llm/llm.module';
import { PersistenceModule } from '../persistence/persistence.module'; // PR-03.10
import { CommonModule } from '../common/common.module'; // PR-03.10 AC-06

/**
 * Orchestrator Module
 *
 * Handles conversation flow orchestration and intent classification.
 *
 * PR-05: Added CheckoutFlow for conversational checkout
 * PR-05.1: MerchantCommandParser + MerchantCommandService registered via ServicesModule
 * PR-06: Added PaymentFallbackFlow for manual payment confirmation
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
    CheckoutFlow, // PR-05
    PaymentFallbackFlow, // PR-06
    PostSaleFlow, // PR-07
    HandoffFlow, // PR-08
    HandoffService, // PR-08 (here instead of ServicesModule to avoid circular deps with LlmModule)
    QueryParserService, // PR-SEARCH-NLU
  ],
  exports: [ConversationOrchestrator],
})
export class OrchestratorModule {}
