import { Provider } from '@nestjs/common';
import { NoopPosAdapter } from './adapters/noop.pos-adapter';
import { PosAdapterRegistryService } from './pos-adapter.registry';

/**
 * Providers de `pos/` para `DeliveryModule` (lo cablea el Integrador en S3.3):
 *   providers: [...POS_PROVIDERS, { provide: POS_ADAPTERS, useValue: [] }, PosOrderSink]
 * `POS_ADAPTERS` es opcional (sin él, todo cae a Noop). Un conector nuevo se agrega a ese
 * array (ver pos/README.md). `PosOrderSink` va en `ORDER_SINKS` después del sink de cocina.
 */
export const POS_PROVIDERS: Provider[] = [NoopPosAdapter, PosAdapterRegistryService];
