import { Provider } from '@nestjs/common';
import { CatalogMatcherService } from './catalog-matcher.service';

/**
 * Providers de catálogo para `DeliveryModule` (lo cablea el Integrador):
 *   imports: [ServicesModule]   // CatalogService (FTS existente)
 *   providers: [...DELIVERY_CATALOG_PROVIDERS], exports: [CatalogMatcherService]
 */
export const DELIVERY_CATALOG_PROVIDERS: Provider[] = [CatalogMatcherService];
