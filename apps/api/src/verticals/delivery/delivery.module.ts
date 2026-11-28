import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../common/feature-flags/feature-flags.module';
import { VerticalsModule } from '../verticals.module';

/**
 * DeliveryModule — Closy Delivery Agent (vertical B2, restaurantes).
 *
 * Todo lo de este módulo está detrás de `FeatureFlagsService.isDeliveryEnabled`
 * y `merchant.industry === 'restaurante'`. Los providers (config, agente,
 * mensajería, sinks, POS…) se registran en los slices siguientes; el handler
 * vertical se registra en `VerticalRouterService` en S2.3.
 */
@Module({
  imports: [FeatureFlagsModule, VerticalsModule],
  providers: [],
  exports: [],
})
export class DeliveryModule {}
