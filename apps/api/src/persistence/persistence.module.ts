import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MessageRepository } from './repositories/message.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { MerchantRepository } from './repositories/merchant.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { CategoryRepository } from './repositories/category.repository';
import { ProductRepository } from './repositories/product.repository';
import { OutboxRepository } from './repositories/outbox.repository';
import { OutboxService } from './outbox/outbox.service';
import { MessageLogRepository } from './repositories/message-log.repository'; // PR-03.10
import { ChannelRepository } from './repositories/channel.repository'; // PR-03.11
import { CartRepository } from './repositories/cart.repository'; // PR-04
import { CartItemRepository } from './repositories/cart-item.repository'; // PR-04

@Global()
@Module({
  providers: [
    PrismaService,
    MessageRepository,
    CustomerRepository,
    MerchantRepository,
    ConversationRepository,
    CategoryRepository,
    ProductRepository,
    OutboxRepository,
    OutboxService,
    MessageLogRepository, // PR-03.10
    ChannelRepository, // PR-03.11
    CartRepository, // PR-04
    CartItemRepository, // PR-04
  ],
  exports: [
    PrismaService,
    MessageRepository,
    CustomerRepository,
    MerchantRepository,
    ConversationRepository,
    CategoryRepository,
    ProductRepository,
    OutboxRepository,
    OutboxService,
    MessageLogRepository, // PR-03.10
    ChannelRepository, // PR-03.11
    CartRepository, // PR-04
    CartItemRepository, // PR-04
  ],
})
export class PersistenceModule {}
