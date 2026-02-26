import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from './feature-flags.service';

function buildService(envOverrides: Record<string, unknown> = {}): FeatureFlagsService {
  const defaults: Record<string, unknown> = {
    FEATURES_MODE: 'mvp',
    MULTI_CHANNEL_ENABLED: false,
    INSTAGRAM_ENABLED: false,
    PLAYBOOK_EDITOR_ENABLED: false,
    INDUSTRIES_ENABLED: false,
  };
  const merged = { ...defaults, ...envOverrides };

  const configService = {
    get: <T>(key: string): T => (merged[key] as T) ?? undefined,
  } as unknown as ConfigService;

  return new FeatureFlagsService(configService);
}

describe('FeatureFlagsService', () => {
  // ──────────────────────────────────────────────────────────
  // AC-02: Kill-switch mode=mvp → all B2 flags return false
  // ──────────────────────────────────────────────────────────
  describe('AC-02: Kill-switch mode=mvp forces all B2 flags to false', () => {
    it('returns false for isMultiChannelEnabled even if env var is true', () => {
      const service = buildService({ FEATURES_MODE: 'mvp', MULTI_CHANNEL_ENABLED: true });
      expect(service.isMultiChannelEnabled).toBe(false);
    });

    it('returns false for isInstagramEnabled even if env var is true', () => {
      const service = buildService({ FEATURES_MODE: 'mvp', INSTAGRAM_ENABLED: true });
      expect(service.isInstagramEnabled).toBe(false);
    });

    it('returns false for isPlaybookEditorEnabled even if env var is true', () => {
      const service = buildService({ FEATURES_MODE: 'mvp', PLAYBOOK_EDITOR_ENABLED: true });
      expect(service.isPlaybookEditorEnabled).toBe(false);
    });

    it('returns false for isIndustriesEnabled even if env var is true', () => {
      const service = buildService({ FEATURES_MODE: 'mvp', INDUSTRIES_ENABLED: true });
      expect(service.isIndustriesEnabled).toBe(false);
    });

    it('reports featuresMode as mvp', () => {
      const service = buildService({ FEATURES_MODE: 'mvp' });
      expect(service.featuresMode).toBe('mvp');
    });
  });

  // ──────────────────────────────────────────────────────────
  // AC-08: mode=dev respects individual flag values
  // ──────────────────────────────────────────────────────────
  describe('AC-08: mode=dev respects individual flag values', () => {
    it('returns true for isMultiChannelEnabled when flag is true', () => {
      const service = buildService({ FEATURES_MODE: 'dev', MULTI_CHANNEL_ENABLED: true });
      expect(service.isMultiChannelEnabled).toBe(true);
    });

    it('returns false for isMultiChannelEnabled when flag is false', () => {
      const service = buildService({ FEATURES_MODE: 'dev', MULTI_CHANNEL_ENABLED: false });
      expect(service.isMultiChannelEnabled).toBe(false);
    });

    it('returns true for isInstagramEnabled when flag is true', () => {
      const service = buildService({ FEATURES_MODE: 'dev', INSTAGRAM_ENABLED: true });
      expect(service.isInstagramEnabled).toBe(true);
    });

    it('returns true for isPlaybookEditorEnabled when flag is true', () => {
      const service = buildService({ FEATURES_MODE: 'dev', PLAYBOOK_EDITOR_ENABLED: true });
      expect(service.isPlaybookEditorEnabled).toBe(true);
    });

    it('returns true for isIndustriesEnabled when flag is true', () => {
      const service = buildService({ FEATURES_MODE: 'dev', INDUSTRIES_ENABLED: true });
      expect(service.isIndustriesEnabled).toBe(true);
    });

    it('reports featuresMode as dev', () => {
      const service = buildService({ FEATURES_MODE: 'dev' });
      expect(service.featuresMode).toBe('dev');
    });
  });

  // ──────────────────────────────────────────────────────────
  // AC-08: mode=full also respects individual flag values
  // ──────────────────────────────────────────────────────────
  describe('AC-08: mode=full respects individual flag values', () => {
    it('returns true for isMultiChannelEnabled when flag is true', () => {
      const service = buildService({ FEATURES_MODE: 'full', MULTI_CHANNEL_ENABLED: true });
      expect(service.isMultiChannelEnabled).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // AC-08: Default values when no FEATURES_MODE set
  // ──────────────────────────────────────────────────────────
  describe('AC-08: Default values (no FEATURES_MODE = defaults to mvp)', () => {
    it('defaults to mvp mode if FEATURES_MODE is not set', () => {
      const configService = {
        get: () => undefined,
      } as unknown as ConfigService;
      const service = new FeatureFlagsService(configService);
      expect(service.featuresMode).toBe('mvp');
    });

    it('all B2 flags return false in default mode', () => {
      const configService = {
        get: () => undefined,
      } as unknown as ConfigService;
      const service = new FeatureFlagsService(configService);
      expect(service.isMultiChannelEnabled).toBe(false);
      expect(service.isInstagramEnabled).toBe(false);
      expect(service.isPlaybookEditorEnabled).toBe(false);
      expect(service.isIndustriesEnabled).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────
  // AC-01: Service is injectable via NestJS DI
  // ──────────────────────────────────────────────────────────
  describe('AC-01: FeatureFlagsService NestJS DI integration', () => {
    let service: FeatureFlagsService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FeatureFlagsService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                const values: Record<string, unknown> = {
                  FEATURES_MODE: 'mvp',
                };
                return values[key] ?? undefined;
              },
            },
          },
        ],
      }).compile();

      service = module.get<FeatureFlagsService>(FeatureFlagsService);
    });

    it('is defined and injectable', () => {
      expect(service).toBeDefined();
    });

    it('returns mvp mode via DI', () => {
      expect(service.featuresMode).toBe('mvp');
    });
  });
});
