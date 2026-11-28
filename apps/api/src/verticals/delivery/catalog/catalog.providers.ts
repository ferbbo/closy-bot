import { Provider } from '@nestjs/common';
import { CatalogMatcherService } from './catalog-matcher.service';
import { CatalogTools } from '../agent/tools/catalog.tools';
import { MenuPresenter } from '../presenters/menu.presenter';

/**
 * Providers de catálogo para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [ServicesModule, PersistenceModule]   // CatalogService (FTS), CategoryRepository
 *   providers: [...DELIVERY_CATALOG_PROVIDERS]
 *   exports: [CatalogMatcherService, CatalogTools]  // S5.3 usa el matcher; S2.3 compone las tools
 */
export const DELIVERY_CATALOG_PROVIDERS: Provider[] = [
  CatalogMatcherService,
  MenuPresenter,
  CatalogTools,
];
