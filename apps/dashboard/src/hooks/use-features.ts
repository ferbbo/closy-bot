
/**
 * useFeatures() hook — Feature flags for MVP/B2 separation
 *
 * Reads NEXT_PUBLIC_FEATURES_MODE and individual feature flags from env vars.
 * Kill-switch: if NEXT_PUBLIC_FEATURES_MODE === 'mvp', all B2 flags return false.
 *
 * REQ-04 (PR-MVP-01): Frontend hook for gating B2 UI components
 * AC-06: Returns correct flags based on env vars
 *
 * Usage:
 *   const { isMultiChannelEnabled } = useFeatures();
 *   {isMultiChannelEnabled && <ConnectAnotherChannelButton />}
 */

export interface FeatureFlags {
  isMultiChannelEnabled: boolean;
  isInstagramEnabled: boolean;
  isIndustriesEnabled: boolean;
  isPlaybookEditorEnabled: boolean;
}

function parseEnvBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function useFeatures(): FeatureFlags {
  const mode = process.env.NEXT_PUBLIC_FEATURES_MODE ?? 'mvp';

  // Kill-switch: mode=mvp → all B2 flags return false (safe default)
  if (mode === 'mvp') {
    return {
      isMultiChannelEnabled: false,
      isInstagramEnabled: false,
      isIndustriesEnabled: false,
      isPlaybookEditorEnabled: false,
    };
  }

  // mode=dev|full: respect individual env var values
  return {
    isMultiChannelEnabled: parseEnvBool(process.env.NEXT_PUBLIC_MULTI_CHANNEL_ENABLED),
    isInstagramEnabled: parseEnvBool(process.env.NEXT_PUBLIC_INSTAGRAM_ENABLED),
    isIndustriesEnabled: parseEnvBool(process.env.NEXT_PUBLIC_INDUSTRIES_ENABLED),
    isPlaybookEditorEnabled: parseEnvBool(process.env.NEXT_PUBLIC_PLAYBOOK_EDITOR_ENABLED),
  };
}
