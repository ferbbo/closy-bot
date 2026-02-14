import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ConversationService } from './conversation.service';
import { CatalogService } from './catalog.service';
import { ImportService } from './import.service';
import { MerchantResolverService } from './merchant-resolver.service';
import { PlaybookService } from './playbook.service';
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
 *
 * Future responsibilities:
 * - Payment service (payment gateway integration)
 * - Delivery service (tracking, zones)
 * - Knowledge base service (RAG for FAQs)
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
  ],
  exports: [
    CustomerService,
    ConversationService,
    CatalogService,
    ImportService,
    MerchantResolverService,
    PlaybookService,
  ],
})
export class ServicesModule {}
