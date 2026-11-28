import { Provider } from '@nestjs/common';
import { BusinessMessengerService } from './business-messenger.service';
import { CustomerServiceWindowService } from './customer-service-window.service';
import { TemplateWebhookHandler } from './template-webhook.handler';

/**
 * Providers de mensajería de negocio (S1.4). El Integrador los registra en DeliveryModule
 * (`providers: [...MESSAGING_PROVIDERS]`, `exports: [BusinessMessengerService, ...]`), que debe
 * importar PersistenceModule (PrismaService, OutboxService) y FeatureFlagsModule.
 * El controlador de WhatsApp resuelve `TemplateWebhookHandler` en caliente vía ModuleRef
 * (strict:false), así que no hay import entre WhatsAppModule y DeliveryModule.
 */
export const MESSAGING_PROVIDERS: Provider[] = [
  CustomerServiceWindowService,
  BusinessMessengerService,
  TemplateWebhookHandler,
];
