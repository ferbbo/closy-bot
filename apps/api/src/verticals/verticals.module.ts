import { Module } from '@nestjs/common';
import { VerticalRouterService } from './vertical-router.service';

/**
 * VerticalsModule — expone el VerticalRouterService (singleton).
 * Lo importan el OrchestratorModule (consumidor) y cada módulo vertical (registro).
 */
@Module({
  providers: [VerticalRouterService],
  exports: [VerticalRouterService],
})
export class VerticalsModule {}
