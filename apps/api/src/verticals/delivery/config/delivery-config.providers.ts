import { Provider } from '@nestjs/common';
import { DeliveryConfigService } from './delivery-config.service';

/**
 * Providers de `config/` para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [PersistenceModule]   // DeliveryConfigService inyecta PrismaService
 *   providers: [...DELIVERY_CONFIG_PROVIDERS], exports: [DeliveryConfigService]
 */
export const DELIVERY_CONFIG_PROVIDERS: Provider[] = [DeliveryConfigService];
