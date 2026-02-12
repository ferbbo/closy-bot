import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MessageRepository } from './repositories/message.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { MerchantRepository } from './repositories/merchant.repository';
import { ConversationRepository } from './repositories/conversation.repository';

@Global()
@Module({
  providers: [
    PrismaService,
    MessageRepository,
    CustomerRepository,
    MerchantRepository,
    ConversationRepository,
  ],
  exports: [
    PrismaService,
    MessageRepository,
    CustomerRepository,
    MerchantRepository,
    ConversationRepository,
  ],
})
export class PersistenceModule {}
