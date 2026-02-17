import { Injectable, Logger } from '@nestjs/common';
import { MessageDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateMessageLogDto {
  conversationId: string;
  merchantId: string;
  direction: MessageDirection;
  providerMessageId?: string;
  text?: string;
  mediaType?: string;
  expiresAt: Date;
}

export interface MessageLogDto {
  id: string;
  conversationId: string;
  merchantId: string;
  direction: MessageDirection;
  providerMessageId?: string;
  text?: string;
  mediaType?: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for MessageLog operations (PR-03.10)
 * Handles short-term message history with TTL for conversational memory
 */
@Injectable()
export class MessageLogRepository {
  private readonly logger = new Logger(MessageLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new message log entry
   * REQ-01: MessageLog registra IN/OUT con expiresAt calculado (AC-02)
   */
  async create(dto: CreateMessageLogDto): Promise<MessageLogDto> {
    const log = await this.prisma.messageLog.create({
      data: {
        conversationId: dto.conversationId,
        merchantId: dto.merchantId,
        direction: dto.direction,
        providerMessageId: dto.providerMessageId,
        text: dto.text,
        mediaType: dto.mediaType,
        expiresAt: dto.expiresAt,
      },
    });

    this.logger.debug(
      `MessageLog created: ${log.id} (conversation=${log.conversationId}, direction=${log.direction})`,
    );

    return this.mapToDto(log);
  }

  /**
   * Find last K messages for a conversation (ordered by createdAt DESC)
   * Used for LLM context building (REQ-05)
   */
  async findLastKByConversation(conversationId: string, limit: number): Promise<MessageLogDto[]> {
    const logs = await this.prisma.messageLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(this.mapToDto);
  }

  /**
   * Count messages for a conversation
   * Used for cap enforcement (REQ-03)
   */
  async countByConversation(conversationId: string): Promise<number> {
    return this.prisma.messageLog.count({
      where: { conversationId },
    });
  }

  /**
   * Delete expired messages (used by cleanup job - REQ-03)
   * @returns count of deleted messages
   */
  async deleteExpired(): Promise<number> {
    const result = await this.prisma.messageLog.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.logger.log(`Deleted ${result.count} expired message logs`);
    return result.count;
  }

  /**
   * Delete oldest messages beyond cap for a conversation (REQ-03 safety cap)
   * @returns count of deleted messages
   */
  async deleteOldestBeyondCap(conversationId: string, maxMessages: number): Promise<number> {
    // Find the Kth newest message (if exists)
    const kthNewest = await this.prisma.messageLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 1,
      skip: maxMessages - 1,
    });

    if (kthNewest.length === 0) {
      // Conversation has <= maxMessages, no deletion needed
      return 0;
    }

    // Delete all messages older than the Kth newest
    const result = await this.prisma.messageLog.deleteMany({
      where: {
        conversationId,
        createdAt: {
          lt: kthNewest[0].createdAt,
        },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Deleted ${result.count} old messages for conversation ${conversationId} (cap=${maxMessages})`,
      );
    }

    return result.count;
  }

  /**
   * Count total messages across all conversations (for metrics)
   */
  async countTotal(): Promise<number> {
    return this.prisma.messageLog.count();
  }

  /**
   * Find conversations with message count exceeding cap (REQ-03)
   * Returns array of {conversationId, count} for conversations with more than maxMessages
   */
  async findConversationsExceedingCap(
    maxMessages: number,
  ): Promise<Array<{ conversationId: string; count: number }>> {
    const result = await this.prisma.messageLog.groupBy({
      by: ['conversationId'],
      _count: { id: true },
      having: {
        id: {
          _count: {
            gt: maxMessages,
          },
        },
      },
    });

    return result.map((group) => ({
      conversationId: group.conversationId,
      count: group._count.id,
    }));
  }

  private mapToDto(log: {
    id: string;
    conversationId: string;
    merchantId: string;
    direction: MessageDirection;
    providerMessageId: string | null;
    text: string | null;
    mediaType: string | null;
    expiresAt: Date;
    createdAt: Date;
  }): MessageLogDto {
    return {
      id: log.id,
      conversationId: log.conversationId,
      merchantId: log.merchantId,
      direction: log.direction,
      providerMessageId: log.providerMessageId ?? undefined,
      text: log.text ?? undefined,
      mediaType: log.mediaType ?? undefined,
      expiresAt: log.expiresAt,
      createdAt: log.createdAt,
    };
  }
}
