import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import { BurstBufferService } from './burst-buffer.service';

export const BURST_SWEEP_INTERVAL_MS = 60_000;

/**
 * S5.1-T2 · Reinicio seguro: cada minuto procesa los `pendingBurst` vencidos que quedaron
 * persistidos sin timer en memoria (reinicio del proceso, otra instancia caída). El
 * compare-and-set de `BurstBufferService.flush` evita el doble procesamiento si el timer y
 * el barrido coinciden. Con el flag apagado no consulta la BD (RN-21).
 */
@Injectable()
export class BurstSweeperService {
  private readonly logger = new Logger(BurstSweeperService.name);
  private running = false;

  constructor(
    private readonly burst: BurstBufferService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  @Interval('delivery-burst-sweep', BURST_SWEEP_INTERVAL_MS)
  async handleInterval(): Promise<void> {
    await this.sweep();
  }

  /** @returns número de buffers procesados */
  async sweep(now: Date = new Date()): Promise<number> {
    if (!this.featureFlags.isDeliveryEnabled || this.running) return 0;
    this.running = true;
    try {
      const ids = await this.burst.findDue(now);
      let processed = 0;
      for (const id of ids) {
        if (await this.burst.flush(id, false)) processed++;
      }
      if (processed > 0) this.logger.log(`Burst sweep processed ${processed} expired buffer(s)`);
      return processed;
    } catch (error) {
      this.logger.error(`Burst sweep failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
