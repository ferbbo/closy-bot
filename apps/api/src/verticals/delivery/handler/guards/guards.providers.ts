import { Provider } from '@nestjs/common';
import { AmountLimitGuard } from './amount-limit.guard';
import { OpeningHoursGuard } from './opening-hours.guard';

/**
 * Guards de S3.2 para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [PersistenceModule]   // PrismaService; DeliveryConfigService ya está en el módulo
 *   providers: [...DELIVERY_GUARDS_PROVIDERS]
 * - OpeningHoursGuard.wrap(handlers) en DeliveryAgentService (RN-07, AC-10).
 * - AmountLimitGuard.exceeds/escalate en confirmar_pedido (S3.3, RN-17, AC-24).
 *   HandoffService se resuelve en runtime con ModuleRef (strict:false).
 */
export const DELIVERY_GUARDS_PROVIDERS: Provider[] = [OpeningHoursGuard, AmountLimitGuard];
