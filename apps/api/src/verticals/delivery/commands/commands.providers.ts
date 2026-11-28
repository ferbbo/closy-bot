import { Provider } from '@nestjs/common';
import { DeliveryCommandsService } from './delivery-commands.service';

/**
 * Providers de comandos del comercio (S4.3). Cablear en DeliveryModule:
 *   providers: [...DELIVERY_COMMANDS_PROVIDERS], exports: [DeliveryCommandsService]
 * Depende de PrismaService y DeliveryConfigService (DELIVERY_CONFIG_PROVIDERS).
 */
export const DELIVERY_COMMANDS_PROVIDERS: Provider[] = [DeliveryCommandsService];
