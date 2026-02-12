import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ConversationService } from './conversation.service';

/**
 * Services Module
 *
 * Contains application services that don't fit in domain or orchestrator.
 *
 * Current services:
 * - CustomerService: identity resolution by phone
 * - ConversationService: chat session management
 *
 * Future responsibilities:
 * - Catalog service (product search)
 * - Payment service (payment gateway integration)
 * - Delivery service (tracking, zones)
 * - Knowledge base service (RAG for FAQs)
 */
@Module({
  providers: [CustomerService, ConversationService],
  exports: [CustomerService, ConversationService],
})
export class ServicesModule {}
