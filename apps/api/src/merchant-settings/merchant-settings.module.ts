import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { ServicesModule } from '../services/services.module';
import { MerchantSettingsController } from './merchant-settings.controller';
import { MerchantSettingsService } from './merchant-settings.service';

@Module({
  imports: [PersistenceModule, AuthModule, ServicesModule],
  controllers: [MerchantSettingsController],
  providers: [MerchantSettingsService],
  exports: [MerchantSettingsService],
})
export class MerchantSettingsModule {}
