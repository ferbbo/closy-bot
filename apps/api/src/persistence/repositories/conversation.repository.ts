import { Injectable, Logger } from '@nestjs/common';
import { Conversation, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for Conversation persistence
 * Manages chat sessions between customers and merchants
 */
@Injectable()
export class ConversationRepository {
  private readonly logger = new Logger(ConversationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new conversation
   */
  async create(data: Prisma.ConversationCreateInput): Promise<Conversation> {
    return this.prisma.conversation.create({ data });
  }

  /**
   * Find a conversation by ID
   */
  async findById(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
    });
  }

  /**
   * Find an active conversation by customer, merchant and channel
   * Returns the most recent active conversation
   */
  async findByCustomerAndChannel(
    customerId: string,
    merchantId: string,
    channel: string,
  ): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({
      where: {
        customerId,
        merchantId,
        channel,
        status: 'active',
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });
  }

  /**
   * Find all conversations for a customer
   */
  async findByCustomerId(customerId: string): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { customerId },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  /**
   * Update conversation data
   */
  async update(id: string, data: Prisma.ConversationUpdateInput): Promise<Conversation> {
    return this.prisma.conversation.update({
      where: { id },
      data,
    });
  }

  /**
   * Update last message timestamp
   */
  async updateLastMessageAt(id: string, timestamp: Date): Promise<Conversation> {
    return this.update(id, { lastMessageAt: timestamp });
  }

  /**
   * Update conversation status
   * @param id Conversation ID
   * @param status New status (must be a valid ConversationStatus value)
   */
  async updateStatus(id: string, status: string): Promise<Conversation> {
    // Validate status is one of the allowed values
    const validStatuses = ['active', 'closed', 'handoff'];
    if (!validStatuses.includes(status)) {
      throw new Error(
        `Invalid conversation status: ${status}. Must be one of: ${validStatuses.join(', ')}`,
      );
    }
    return this.update(id, { status });
  }

  /**
   * PR-03.10: Update conversation memory fields (REQ-04, AC-04)
   * @param id Conversation ID
   * @param memory Memory data to update
   */
  async updateMemory(
    id: string,
    memory: {
      summary?: string;
      memoryFacts?: Record<string, unknown>;
      lastIntent?: string;
      lastSummarizedAt?: Date;
    },
  ): Promise<Conversation> {
    return this.update(id, {
      summary: memory.summary,
      memoryFacts: memory.memoryFacts as Prisma.InputJsonValue,
      lastIntent: memory.lastIntent,
      lastSummarizedAt: memory.lastSummarizedAt,
    });
  }

  /**
   * PR-03.10: Find conversations that need summarization (REQ-04, AC-04)
   * Candidates are conversations that:
   * - Are active
   * - Have recent activity (lastMessageAt within X days)
   * - Never summarized OR summarized > Y days ago
   */
  async findCandidatesForSummarization(
    minMessagesSince: Date,
    lastSummarizedBefore: Date,
    limit: number,
  ): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: {
        status: 'active',
        lastMessageAt: {
          gte: minMessagesSince,
        },
        OR: [
          { lastSummarizedAt: null },
          {
            lastSummarizedAt: {
              lt: lastSummarizedBefore,
            },
          },
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
    });
  }
}
