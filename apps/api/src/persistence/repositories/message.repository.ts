import { Injectable, Logger } from '@nestjs/common';
import { InboundMessage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for InboundMessage persistence
 * Handles idempotency via unique constraint on messageId
 */
@Injectable()
export class MessageRepository {
  private readonly logger = new Logger(MessageRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new inbound message with idempotency guarantee
   * @throws PrismaClientKnownRequestError with code 'P2002' if messageId already exists
   */
  async create(data: Prisma.InboundMessageCreateInput): Promise<InboundMessage> {
    return this.prisma.inboundMessage.create({ data });
  }

  /**
   * Find an inbound message by its unique messageId
   */
  async findByMessageId(messageId: string): Promise<InboundMessage | null> {
    return this.prisma.inboundMessage.findUnique({
      where: { messageId },
    });
  }

  /**
   * Mark message as processed
   */
  async markAsProcessed(id: string): Promise<InboundMessage> {
    return this.prisma.inboundMessage.update({
      where: { id },
      data: { processed: true },
    });
  }

  /**
   * Find messages by sender (for debugging/analytics)
   */
  async findBySender(from: string, limit = 50): Promise<InboundMessage[]> {
    return this.prisma.inboundMessage.findMany({
      where: { from },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}
