import { Provider } from '@nestjs/common';
import { CartPresenter } from '../../presenters/cart.presenter';
import { PaymentTools } from './payment.tools';

/**
 * Providers de la herramienta de pago (S3.2) para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [PersistenceModule]   // PrismaService, CartRepository
 *   providers: [...PAYMENT_TOOLS_PROVIDERS]
 * `CartPresenter` ya lo registra CART_TOOLS_PROVIDERS; Nest deduplica el token si se repite.
 * DeliveryAgentService inyecta `PaymentTools` y registra `definitions` + `handlers()`.
 */
export const PAYMENT_TOOLS_PROVIDERS: Provider[] = [PaymentTools, CartPresenter];
