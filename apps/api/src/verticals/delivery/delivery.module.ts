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
import { ORDER_TOOLS_PROVIDERS } from './agent/tools/order-tools.providers';
import { DELIVERY_ORDER_LIFECYCLE } from './agent/tools/order.tools';
import { LIFECYCLE_PROVIDERS } from './lifecycle/lifecycle.providers';
import { LifecycleCommandsService } from './lifecycle/lifecycle-commands';
import { DeliveryOrderLifecycleService } from './lifecycle/delivery-order-lifecycle.service';
import { DELIVERY_MERCHANT_COMMANDS } from './lifecycle/merchant-commands.token';
import { DELIVERY_COMMANDS_PROVIDERS } from './commands/commands.providers';
import { DeliveryCommandsService } from './commands/delivery-commands.service';
import { ConfirmTools } from './agent/tools/confirm.tools';
import { OrderSummaryPresenter } from './presenters/order-summary.presenter';
import { KitchenTicketPresenter } from './presenters/kitchen-ticket.presenter';
import { OrderSinkRunner, WhatsAppKitchenSink } from './sinks/whatsapp-kitchen.sink';
import { PAYMENT_TOOLS_PROVIDERS } from './agent/tools/payment-tools.providers';
import { DELIVERY_GUARDS_PROVIDERS } from './handler/guards/guards.providers';
import {
  DELIVERY_CHECKOUT_PROVIDERS,
  DELIVERY_TOOLS_PROVIDERS,
} from './checkout/checkout.providers';
import { PosOrderSink } from './sinks/pos-order.sink';
import { ORDER_SINKS, POS_ADAPTERS } from './contracts';
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
    // Confirmation + kitchen output (S3.3): sinks run in order, a failure never stops the next
    ConfirmTools,
    OrderSummaryPresenter,
    KitchenTicketPresenter,
    WhatsAppKitchenSink,
    OrderSinkRunner,
    // Merchant operation commands (S4.3): agotado/disponible, cerrar/abrir tienda, reporte
    ...DELIVERY_COMMANDS_PROVIDERS,
    // Kitchen lifecycle (S4.1) + merchant command delegation: first handler that answers wins
    ...LIFECYCLE_PROVIDERS,
    // Customer self-service tools (S4.2)
    ...ORDER_TOOLS_PROVIDERS,
    { provide: DELIVERY_ORDER_LIFECYCLE, useExisting: DeliveryOrderLifecycleService },
    {
      provide: DELIVERY_MERCHANT_COMMANDS,
      useFactory: (lifecycle: LifecycleCommandsService, commands: DeliveryCommandsService) => [
        lifecycle,
        commands,
      ],
      inject: [LifecycleCommandsService, DeliveryCommandsService],
    },
    {
      provide: ORDER_SINKS,
      useFactory: (kitchen: WhatsAppKitchenSink, pos: PosOrderSink) => [kitchen, pos],
      inject: [WhatsAppKitchenSink, PosOrderSink],
    },
  ],
  exports: [
    DeliveryConfigService,
    BusinessMessengerService,
    CustomerServiceWindowService,
    CatalogMatcherService,
    DeliveryCommandsService,
    DeliveryOrderLifecycleService,
  ],
})
export class DeliveryModule {}
