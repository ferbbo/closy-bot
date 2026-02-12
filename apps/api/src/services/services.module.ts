import { Module } from '@nestjs/common';

/**
 * Services Module
 *
 * Contains application services that don't fit in domain or orchestrator.
 * This is a placeholder module for MVP bootstrap.
 *
 * Future responsibilities:
 * - Catalog service (product search)
 * - Payment service (payment gateway integration)
 * - Delivery service (tracking, zones)
 * - Knowledge base service (RAG for FAQs)
 */
@Module({})
export class ServicesModule {}
