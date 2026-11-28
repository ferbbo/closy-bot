import { Provider } from '@nestjs/common';
import { CustomerStatusNotifierService } from './customer-status-notifier.service';
import { DeliveryOrderLifecycleService } from './delivery-order-lifecycle.service';
import { LifecycleCommandsService } from './lifecycle-commands';
import { DELIVERY_MERCHANT_COMMANDS } from './merchant-commands.token';

/**
 * Providers del ciclo de vida (S4.1). El Integrador los registra en DeliveryModule
 * (`providers: [...LIFECYCLE_PROVIDERS]`, `exports: [DeliveryOrderLifecycleService, DELIVERY_MERCHANT_COMMANDS]`).
 * Requiere BusinessMessengerService, PrismaService y FeatureFlagsService en el módulo.
 * S4.3 añade sus handlers al array de DELIVERY_MERCHANT_COMMANDS (el primero que responde gana).
 */
export const LIFECYCLE_PROVIDERS: Provider[] = [
  CustomerStatusNotifierService,
  DeliveryOrderLifecycleService,
  LifecycleCommandsService,
  {
    provide: DELIVERY_MERCHANT_COMMANDS,
    useFactory: (lifecycle: LifecycleCommandsService) => [lifecycle],
    inject: [LifecycleCommandsService],
  },
];
