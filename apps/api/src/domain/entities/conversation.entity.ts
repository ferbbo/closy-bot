/**
 * Conversation status enum
 */
export enum ConversationStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  HANDOFF = 'handoff',
}

/**
 * Channel enum
 */
export enum Channel {
  WHATSAPP = 'whatsapp',
  WEBCHAT = 'webchat',
  INSTAGRAM = 'instagram',
}

/**
 * Conversation entity - represents a chat session between customer and merchant
 */
export class Conversation {
  id: string;
  customerId: string;
  merchantId: string;
  channel: Channel;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Conversation) {
    this.id = data.id;
    this.customerId = data.customerId;
    this.merchantId = data.merchantId;
    this.channel = data.channel;
    this.status = data.status;
    this.lastMessageAt = data.lastMessageAt;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
