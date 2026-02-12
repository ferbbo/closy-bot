import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MessageRepository } from './repositories/message.repository';

@Global()
@Module({
  providers: [PrismaService, MessageRepository],
  exports: [PrismaService, MessageRepository],
})
export class PersistenceModule {}
