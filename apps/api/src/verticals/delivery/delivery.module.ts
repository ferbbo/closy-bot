import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../common/feature-flags/feature-flags.module';
import { VerticalsModule } from '../verticals.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { DELIVERY_CONFIG_PROVIDERS } from './config/delivery-config.providers';
import { DeliveryConfigService } from './config/delivery-config.service';
import { MESSAGING_PROVIDERS } from './messaging/messaging.providers';
import { CART_TOOLS_PROVIDERS } from './agent/tools/cart-tools.providers';
import { DELIVERY_CATALOG_PROVIDERS } from './catalog/catalog.providers';
import { CatalogMatcherService } from './catalog/catalog-matcher.service';
import { LlmModule } from '../../llm/llm.module';
import { GroundingValidator } from './agent/grounding-validator';
import { DeliveryAgentService, DELIVERY_LLM_PROVIDER } from './agent/delivery-agent.service';
import { DeliveryVerticalHandler } from './handler/delivery-vertical.handler';
import { POS_PROVIDERS } from './pos/pos.providers';
import { PAYMENT_TOOLS_PROVIDERS } from './agent/tools/payment-tools.providers';
import { DELIVERY_GUARDS_PROVIDERS } from './handler/guards/guards.providers';
import {
  DELIVERY_CHECKOUT_PROVIDERS,
  DELIVERY_TOOLS_PROVIDERS,
} from './checkout/checkout.providers';
import { PosOrderSink } from './sinks/pos-order.sink';
import { POS_ADAPTERS } from './contracts';
import { ServicesModule } from '../../services/services.module';
import { BusinessMessengerService } from './messaging/business-messenger.service';
import { CustomerServiceWindowService } from './messaging/customer-service-window.service';

/**
 * DeliveryModule — Closy Delivery Agent (vertical B2, restaurantes).
 *
 * Todo lo de este módulo está detrás de `FeatureFlagsService.isDeliveryEnabled`
 * y `merchant.industry === 'restaurante'`. Los providers (config, agente,
 * mensajería, sinks, POS…) se suman por slice; `DeliveryVerticalHandler` se
 * registra solo en `VerticalRouterService` (onModuleInit).
 */
@Module({
  imports: [FeatureFlagsModule, VerticalsModule, PersistenceModule, ServicesModule, LlmModule],
  providers: [
    ...DELIVERY_CONFIG_PROVIDERS,
    ...MESSAGING_PROVIDERS,
    ...CART_TOOLS_PROVIDERS,
    ...DELIVERY_CATALOG_PROVIDERS,
    GroundingValidator,
    DeliveryAgentService,
    DeliveryVerticalHandler,
    // Override point for tests/e2e (FakeLlmProvider); null → Groq via LlmService
    { provide: DELIVERY_LLM_PROVIDER, useValue: null },
    // POS port (S3.4): no concrete connector yet → registry falls back to NoopPosAdapter
    ...POS_PROVIDERS,
    { provide: POS_ADAPTERS, useValue: [] },
    PosOrderSink,
    // Checkout (S3.1): draft store, quote provider and delivery tools
    ...DELIVERY_CHECKOUT_PROVIDERS,
    ...DELIVERY_TOOLS_PROVIDERS,
    // Payment, opening hours and amount limit (S3.2)
    ...PAYMENT_TOOLS_PROVIDERS,
    ...DELIVERY_GUARDS_PROVIDERS,
  ],
  exports: [
    DeliveryConfigService,
    BusinessMessengerService,
    CustomerServiceWindowService,
    CatalogMatcherService,
  ],
})
export class DeliveryModule {}
