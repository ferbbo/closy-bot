import { Provider } from '@nestjs/common';
import { CartPresenter } from '../../presenters/cart.presenter';
import { CartTools } from './cart.tools';

/**
 * Providers de las herramientas de carrito (S2.2) para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [PersistenceModule, ServicesModule]   // CartItemRepository, ProductRepository, CartService
 *   providers: [...CART_TOOLS_PROVIDERS]
 * DeliveryAgentService (S2.3) inyecta `CartTools` y registra `definitions` + `handlers()`.
 */
export const CART_TOOLS_PROVIDERS: Provider[] = [CartTools, CartPresenter];
