import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { PlaybookService } from '../services/playbook.service';
import { MerchantSettingsController } from './merchant-settings.controller';
import { MerchantSettingsService } from './merchant-settings.service';

@Module({
  imports: [PersistenceModule, AuthModule],
  controllers: [MerchantSettingsController],
  providers: [MerchantSettingsService, PlaybookService],
  exports: [MerchantSettingsService],
})
export class MerchantSettingsModule {}
