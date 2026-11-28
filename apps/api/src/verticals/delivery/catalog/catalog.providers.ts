import { Provider } from '@nestjs/common';
import { CatalogMatcherService } from './catalog-matcher.service';
import { CatalogTools } from '../agent/tools/catalog.tools';
import { BusinessInfoTool } from '../agent/tools/business-info.tool';
import { MenuPresenter } from '../presenters/menu.presenter';

/**
 * Providers de catálogo e información del negocio para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [ServicesModule, PersistenceModule]   // CatalogService (FTS), PlaybookService,
 *                                                  // CategoryRepository, PrismaService
 *   providers: [...DELIVERY_CONFIG_PROVIDERS, ...DELIVERY_CATALOG_PROVIDERS]  // BusinessInfoTool usa DeliveryConfigService
 *   exports: [CatalogMatcherService, CatalogTools, BusinessInfoTool]  // S5.3 usa el matcher; S2.3 compone las tools
 */
export const DELIVERY_CATALOG_PROVIDERS: Provider[] = [
  CatalogMatcherService,
  MenuPresenter,
  CatalogTools,
  BusinessInfoTool,
];
