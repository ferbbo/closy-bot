import { Provider } from '@nestjs/common';
import { SHIPPING_QUOTE_PROVIDER } from '../contracts';
import { CheckoutDraftStore } from './checkout-draft.store';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DeliveryTools } from '../agent/tools/delivery.tools';

/**
 * Providers de `checkout/` (S3.1) para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [PersistenceModule]   // PrismaService
 *   requiere DELIVERY_CONFIG_PROVIDERS (DeliveryConfigService)
 *   providers: [...DELIVERY_CHECKOUT_PROVIDERS]
 */
export const DELIVERY_CHECKOUT_PROVIDERS: Provider[] = [
  CheckoutDraftStore,
  DeliveryQuoteService,
  { provide: SHIPPING_QUOTE_PROVIDER, useExisting: DeliveryQuoteService },
];

/**
 * Herramientas de entrega (S3.1-T2). Requiere DELIVERY_CHECKOUT_PROVIDERS, DeliveryConfigService,
 * CartService (ServicesModule) y CartPresenter (CART_TOOLS_PROVIDERS).
 * DeliveryAgentService debe inyectar `DeliveryTools` y registrar `definitions` + `handlers()`.
 */
export const DELIVERY_TOOLS_PROVIDERS: Provider[] = [DeliveryTools];
