import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MessageRepository } from './repositories/message.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { MerchantRepository } from './repositories/merchant.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { CategoryRepository } from './repositories/category.repository';
import { ProductRepository } from './repositories/product.repository';

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
  ],
  exports: [
    PrismaService,
    MessageRepository,
    CustomerRepository,
    MerchantRepository,
    ConversationRepository,
    CategoryRepository,
    ProductRepository,
  ],
})
export class PersistenceModule {}
