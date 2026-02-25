import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ConversationService } from './conversation.service';
import { CatalogService } from './catalog.service';
import { ImportService } from './import.service';
import { MerchantResolverService } from './merchant-resolver.service';
import { PlaybookService } from './playbook.service';
import { CartService } from './cart.service';
import { CheckoutService } from './checkout.service'; // PR-05
import { MerchantNotificationService } from './merchant-notification.service'; // PR-05
import { MerchantCommandParserService } from './merchant-command-parser.service'; // PR-05.1
import { MerchantCommandService } from './merchant-command.service'; // PR-05.1
import { PaymentService } from './payment.service'; // PR-06
import { PersistenceModule } from '../persistence/persistence.module';

/**
 * Services Module
 *
 * Contains application services that don't fit in domain or orchestrator.
 *
 * Current services:
 * - CustomerService: identity resolution by phone
 * - ConversationService: chat session management
 * - CatalogService: product search and retrieval
 * - ImportService: CSV product import with validation
 * - MerchantResolverService: merchant resolution by WhatsApp phone
 * - CartService: shopping cart CRUD (PR-04)
 * - CheckoutService: checkout flow logic (PR-05)
 * - MerchantNotificationService: merchant WhatsApp notifications (PR-05)
 * - MerchantCommandParserService: parse merchant WhatsApp commands (PR-05.1)
 * - MerchantCommandService: execute merchant admin commands (PR-05.1)
 * - PaymentService: payment confirmation + webhook processing (PR-06)
 */
@Module({
  imports: [PersistenceModule],
  providers: [
    CustomerService,
    ConversationService,
    CatalogService,
    ImportService,
    MerchantResolverService,
    PlaybookService,
    CartService,
    CheckoutService, // PR-05
    MerchantNotificationService, // PR-05
    MerchantCommandParserService, // PR-05.1
    MerchantCommandService, // PR-05.1
    PaymentService, // PR-06
  ],
  exports: [
    CustomerService,
    ConversationService,
    CatalogService,
    ImportService,
    MerchantResolverService,
    PlaybookService,
    CartService,
    CheckoutService, // PR-05
    MerchantNotificationService, // PR-05
    MerchantCommandParserService, // PR-05.1
    MerchantCommandService, // PR-05.1
    PaymentService, // PR-06
  ],
})
export class ServicesModule {}
