import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ConversationService } from './conversation.service';
import { CatalogService } from './catalog.service';
import { ImportService } from './import.service';
import { CartService } from './cart.service';

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
 * - CartService: shopping cart CRUD operations (PR-04)
 *
 * Future responsibilities:
 * - Payment service (payment gateway integration)
 * - Delivery service (tracking, zones)
 * - Knowledge base service (RAG for FAQs)
 */
@Module({
  providers: [CustomerService, ConversationService, CatalogService, ImportService, CartService],
  exports: [CustomerService, ConversationService, CatalogService, ImportService, CartService],
})
export class ServicesModule {}
