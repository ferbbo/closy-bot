import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FeaturesMode = 'mvp' | 'dev' | 'full';

/**
 * FeatureFlagsService — Infrastructure for MVP/B2 feature separation
 *
 * Kill-switch: FEATURES_MODE=mvp → all B2 flags return false (forced override)
 * FEATURES_MODE=dev|full → flags respect individual env var values
 *
 * REQ-01: Kill-switch global
 * REQ-02: Flags granulares (multi-channel, instagram, playbook-editor, industries)
 */
@Injectable()
export class FeatureFlagsService {
  private readonly mode: FeaturesMode;

  constructor(private readonly configService: ConfigService) {
    this.mode = (this.configService.get<string>('FEATURES_MODE') ?? 'mvp') as FeaturesMode;
  }

  get featuresMode(): FeaturesMode {
    return this.mode;
  }

  /**
   * AC-02: Kill-switch — mode=mvp forces all B2 flags to false
   */
  private isMvpMode(): boolean {
    return this.mode === 'mvp';
  }

  /**
   * Allows multiple WhatsApp/Instagram channels per merchant (B2 feature)
   * REQ-01, REQ-03: Gating server-side for multi-channel creation
   */
  get isMultiChannelEnabled(): boolean {
    if (this.isMvpMode()) return false;
    return this.configService.get<boolean>('MULTI_CHANNEL_ENABLED') ?? false;
  }

  /**
   * Enables Instagram channel onboarding (B2 feature)
   */
  get isInstagramEnabled(): boolean {
    if (this.isMvpMode()) return false;
    return this.configService.get<boolean>('INSTAGRAM_ENABLED') ?? false;
  }

  /**
   * Enables advanced playbook editor (B2 feature)
   * MVP uses simple editable FAQs only
   */
  get isPlaybookEditorEnabled(): boolean {
    if (this.isMvpMode()) return false;
    return this.configService.get<boolean>('PLAYBOOK_EDITOR_ENABLED') ?? false;
  }

  /**
   * Enables industry vertical selector (ropa/belleza/minimarket) (B2 feature)
   * MVP uses "Retail General" preset only
   */
  get isIndustriesEnabled(): boolean {
    if (this.isMvpMode()) return false;
    return this.configService.get<boolean>('INDUSTRIES_ENABLED') ?? false;
  }

  /**
   * Delivery vertical (Closy Delivery Agent, B2). Habilita el agente de pedidos a
   * domicilio para comercios con industry='restaurante'. Kill-switch: mvp → false.
   */
  get isDeliveryEnabled(): boolean {
    if (this.isMvpMode()) return false;
    return this.configService.get<boolean>('DELIVERY_ENABLED') ?? false;
  }
}
