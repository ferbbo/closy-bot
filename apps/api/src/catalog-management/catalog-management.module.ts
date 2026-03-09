import { Module } from '@nestjs/common';
import { CatalogManagementController } from './catalog-management.controller';
import { PersistenceModule } from '../persistence/persistence.module';
import { ServicesModule } from '../services/services.module';
import { AuthModule } from '../auth/auth.module';
import { MerchantAuthGuard } from '../common/guards/merchant-auth.guard';

/**
 * CatalogManagementModule provides HTTP endpoints for merchant catalog management
 * Requires:
 * - PersistenceModule (repositories)
 * - ServicesModule (ImportService, CatalogService)
 * - AuthModule (SessionService for MerchantAuthGuard)
 */
@Module({
  imports: [PersistenceModule, ServicesModule, AuthModule],
  controllers: [CatalogManagementController],
  providers: [MerchantAuthGuard],
})
export class CatalogManagementModule {}
