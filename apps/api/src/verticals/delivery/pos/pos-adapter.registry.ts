import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  POS_ADAPTERS,
  type PosAdapter,
  type PosAdapterRegistry,
  type PosIntegrationConfig,
} from '../contracts';
import { NOOP_POS_PROVIDER, NoopPosAdapter } from './adapters/noop.pos-adapter';

/**
 * PosAdapterRegistry (S3.4-T1). Resuelve el adapter del comercio por `config.provider`.
 * - `provider='none'`, `enabled=false` o config ausente → NoopPosAdapter.
 * - Proveedor desconocido (no registrado en `POS_ADAPTERS`) → NoopPosAdapter + warning
 *   (una vez por proveedor; solo el nombre del proveedor, nunca settings ni secretRef).
 */
@Injectable()
export class PosAdapterRegistryService implements PosAdapterRegistry {
  private readonly logger = new Logger(PosAdapterRegistryService.name);
  private readonly byProvider = new Map<string, PosAdapter>();
  private readonly warnedUnknown = new Set<string>();

  constructor(
    private readonly noop: NoopPosAdapter,
    @Optional() @Inject(POS_ADAPTERS) adapters?: PosAdapter[] | null,
  ) {
    for (const adapter of adapters ?? []) {
      if (adapter.provider === NOOP_POS_PROVIDER) continue;
      if (this.byProvider.has(adapter.provider)) {
        this.logger.warn(`duplicate POS adapter for provider=${adapter.provider}; keeping first`);
        continue;
      }
      this.byProvider.set(adapter.provider, adapter);
    }
  }

  resolve(config: PosIntegrationConfig | null | undefined): PosAdapter {
    if (!config || !config.enabled || !config.provider || config.provider === NOOP_POS_PROVIDER) {
      return this.noop;
    }
    const adapter = this.byProvider.get(config.provider);
    if (adapter) return adapter;
    if (!this.warnedUnknown.has(config.provider)) {
      this.warnedUnknown.add(config.provider);
      this.logger.warn(
        `POS provider not registered: provider=${config.provider}; falling back to noop`,
      );
    }
    return this.noop;
  }

  /** Proveedores registrados (diagnóstico / tests). */
  registeredProviders(): string[] {
    return [...this.byProvider.keys()];
  }
}
