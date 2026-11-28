import { Provider } from '@nestjs/common';
import { OrderTools } from './order.tools';

/**
 * Providers de las herramientas de autoservicio del cliente (S4.2) para `DeliveryModule`
 * (lo cablea el Integrador):
 *   imports: [PersistenceModule, ServicesModule]   // PrismaService, CartService
 *   providers: [
 *     ...ORDER_TOOLS_PROVIDERS,
 *     { provide: DELIVERY_ORDER_LIFECYCLE, useExisting: <servicio de ciclo de vida de S4.1> },
 *   ]
 * Requiere también `CartPresenter` (ya en CART_TOOLS_PROVIDERS).
 * DeliveryAgentService inyecta `OrderTools` y registra `definitions` + `handlers()`.
 */
export const ORDER_TOOLS_PROVIDERS: Provider[] = [OrderTools];
