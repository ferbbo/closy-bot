import { Module } from '@nestjs/common';
import { CatalogManagementController } from './catalog-management.controller';
import { PersistenceModule } from '../persistence/persistence.module';
import { ServicesModule } from '../services/services.module';
import { AuthModule } from '../auth/auth.module';
import { MerchantAuthGuard } from '../common/guards/merchant-auth.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { StorageModule } from '../storage/storage.module';

/**
 * CatalogManagementModule provides HTTP endpoints for merchant catalog management
 * Requires:
 * - PersistenceModule (repositories)
 * - ServicesModule (ImportService, CatalogService)
 * - AuthModule (SessionService for MerchantAuthGuard + SessionAuthGuard)
 * - StorageModule (StorageService, ImageProcessorService, ImageValidatorService — PR-18)
 */
@Module({
  imports: [PersistenceModule, ServicesModule, AuthModule, StorageModule],
  controllers: [CatalogManagementController],
  providers: [MerchantAuthGuard, SessionAuthGuard],
})
export class CatalogManagementModule {}
