import { Provider } from '@nestjs/common';
import { SHIPPING_QUOTE_PROVIDER } from '../contracts';
import { CheckoutDraftStore } from './checkout-draft.store';
import { DeliveryQuoteService } from './delivery-quote.service';

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
