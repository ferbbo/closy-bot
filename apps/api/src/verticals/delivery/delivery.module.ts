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
import { ServicesModule } from '../../services/services.module';
import { BusinessMessengerService } from './messaging/business-messenger.service';
import { CustomerServiceWindowService } from './messaging/customer-service-window.service';

/**
 * DeliveryModule — Closy Delivery Agent (vertical B2, restaurantes).
 *
 * Todo lo de este módulo está detrás de `FeatureFlagsService.isDeliveryEnabled`
 * y `merchant.industry === 'restaurante'`. Los providers (config, agente,
 * mensajería, sinks, POS…) se registran en los slices siguientes; el handler
 * vertical se registra en `VerticalRouterService` en S2.3.
 */
@Module({
  imports: [FeatureFlagsModule, VerticalsModule, PersistenceModule, ServicesModule],
  providers: [
    ...DELIVERY_CONFIG_PROVIDERS,
    ...MESSAGING_PROVIDERS,
    ...CART_TOOLS_PROVIDERS,
    ...DELIVERY_CATALOG_PROVIDERS,
  ],
  exports: [
    DeliveryConfigService,
    BusinessMessengerService,
    CustomerServiceWindowService,
    CatalogMatcherService,
  ],
})
export class DeliveryModule {}
