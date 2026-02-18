import { Injectable, Logger } from '@nestjs/common';
import { Conversation, Channel, ConversationStatus } from '../domain/entities/conversation.entity';
import { ConversationRepository } from '../persistence/repositories/conversation.repository';

/**
 * Conversation service - manages chat sessions
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly conversationRepository: ConversationRepository) {}

  /**
   * Get or create a conversation for a customer on a specific channel
   * Returns existing active conversation or creates a new one
   * PR-03.11 AC-11: Includes channelId for multi-channel support
   * @param customerId Customer ID
   * @param merchantId Merchant ID
   * @param channel Channel (whatsapp, webchat, instagram)
   * @param channelId Channel ID (PR-03.11)
   * @returns Active conversation
   */
  async getOrCreateConversation(
    customerId: string,
    merchantId: string,
    channel: Channel,
    channelId?: string | null,
  ): Promise<Conversation> {
    this.logger.log(
      `Getting or creating conversation: customer=${customerId}, merchant=${merchantId}, channel=${channel}, channelId=${channelId}`,
    );

    // Try to find existing active conversation
    let conversation = await this.conversationRepository.findByCustomerAndChannel(
      customerId,
      merchantId,
      channel,
      channelId ?? undefined,
    );

    if (conversation) {
      this.logger.log(`Active conversation found: ${conversation.id}`);
      // Update last message timestamp and return updated object
      return this.conversationRepository.updateLastMessageAt(conversation.id, new Date());
    }

    // Create new conversation if not found
    this.logger.log(
      `Creating new conversation: customer=${customerId}, merchant=${merchantId}, channel=${channel}, channelId=${channelId}`,
    );
    conversation = await this.conversationRepository.create({
      customer: { connect: { id: customerId } },
      merchant: { connect: { id: merchantId } },
      channelId, // PR-03.11 AC-11
      channel,
      status: ConversationStatus.ACTIVE,
      lastMessageAt: new Date(),
    });

    this.logger.log(`Conversation created: ${conversation.id}`);
    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async findById(id: string): Promise<Conversation | null> {
    return this.conversationRepository.findById(id);
  }

  /**
   * Update conversation status
   * @param id Conversation ID
   * @param status New status
   */
  async updateStatus(id: string, status: ConversationStatus): Promise<Conversation> {
    this.logger.log(`Updating conversation status: ${id} -> ${status}`);
    return this.conversationRepository.updateStatus(id, status);
  }

  /**
   * Close a conversation
   */
  async close(id: string): Promise<Conversation> {
    return this.updateStatus(id, ConversationStatus.CLOSED);
  }

  /**
   * Handoff conversation to human agent
   */
  async handoff(id: string): Promise<Conversation> {
    this.logger.log(`Handing off conversation to human: ${id}`);
    return this.updateStatus(id, ConversationStatus.HANDOFF);
  }

  /**
   * Get all conversations for a customer
   */
  async findByCustomerId(customerId: string): Promise<Conversation[]> {
    return this.conversationRepository.findByCustomerId(customerId);
  }

  /**
   * Update last message timestamp
   */
  async updateLastMessageAt(id: string, timestamp: Date): Promise<Conversation> {
    return this.conversationRepository.updateLastMessageAt(id, timestamp);
  }
}
