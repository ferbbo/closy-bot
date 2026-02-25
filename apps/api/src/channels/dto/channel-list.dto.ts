import { ChannelType, ChannelStatus } from '@prisma/client';

/**
 * DTO for channel list item
 * REQ-02: Safe DTO without credentials (AC-04)
 */
export class ChannelListItemDto {
  id!: string;
  type!: ChannelType;
  displayName!: string;
  status!: ChannelStatus;
  webhookSubscribed!: boolean;
  lastWebhookAt!: Date | null;
  createdAt!: Date;
}
