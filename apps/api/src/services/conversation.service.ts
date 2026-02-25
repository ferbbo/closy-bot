import { Injectable, Logger } from '@nestjs/common';
import { Conversation, ConversationType } from '@prisma/client'; // PR-05.1
import { Channel, ConversationStatus } from '../domain/entities/conversation.entity';
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
   * PR-05.1: Accepts optional type (CUSTOMER | MERCHANT_ADMIN)
   * @param customerId Customer ID
   * @param merchantId Merchant ID
   * @param channel Channel (whatsapp, webchat, instagram)
   * @param channelId Channel ID (PR-03.11)
   * @param type Conversation type (default: CUSTOMER) — PR-05.1
   * @returns Active conversation
   */
  async getOrCreateConversation(
    customerId: string,
    merchantId: string,
    channel: Channel,
    channelId?: string | null,
    type?: ConversationType,
  ): Promise<Conversation> {
    this.logger.log(
      `Getting or creating conversation: customer=${customerId}, merchant=${merchantId}, channel=${channel}, channelId=${channelId}, type=${type ?? 'CUSTOMER'}`,
    );

    // Try to find existing active conversation (filter by type if provided)
    let conversation = await this.conversationRepository.findByCustomerAndChannel(
      customerId,
      merchantId,
      channel,
      channelId ?? undefined,
      type,
    );

    if (conversation) {
      this.logger.log(`Active conversation found: ${conversation.id}`);
      // Update last message timestamp and return updated object
      return this.conversationRepository.updateLastMessageAt(conversation.id, new Date());
    }

    // Create new conversation if not found
    this.logger.log(
      `Creating new conversation: customer=${customerId}, merchant=${merchantId}, channel=${channel}, channelId=${channelId}, type=${type ?? 'CUSTOMER'}`,
    );

    // PR-03.11: Build create input with optional channelRef relation
    const createInput: {
      customer: { connect: { id: string } };
      merchant: { connect: { id: string } };
      channel: string;
      type?: ConversationType;
      status: string;
      lastMessageAt: Date;
      channelRef?: { connect: { id: string } };
    } = {
      customer: { connect: { id: customerId } },
      merchant: { connect: { id: merchantId } },
      channel,
      status: ConversationStatus.ACTIVE,
      lastMessageAt: new Date(),
    };

    // PR-05.1: Set conversation type if provided
    if (type) {
      createInput.type = type;
    }

    // PR-03.11 AC-11: Connect channel if provided
    if (channelId) {
      createInput.channelRef = { connect: { id: channelId } };
    }

    conversation = await this.conversationRepository.create(createInput);

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
