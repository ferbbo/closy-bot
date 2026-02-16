import { Module } from '@nestjs/common';
import { CatalogManagementController } from './catalog-management.controller';
import { PersistenceModule } from '../persistence/persistence.module';
import { ServicesModule } from '../services/services.module';

/**
 * CatalogManagementModule provides HTTP endpoints for merchant catalog management
 * Requires:
 * - PersistenceModule (repositories)
 * - ServicesModule (ImportService, CatalogService)
 */
@Module({
  imports: [PersistenceModule, ServicesModule],
  controllers: [CatalogManagementController],
})
export class CatalogManagementModule {}
