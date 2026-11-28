import { resolveNotificationSettings } from './notification-settings';

describe('resolveNotificationSettings (S1.4-T3)', () => {
  it('resolveNotificationSettings applies technical defaults', () => {
    expect(resolveNotificationSettings(null)).toEqual({
      mode: 'template_always',
      templateLanguage: 'es',
      maxBusinessInitiatedPerOrder: 6,
    });
    expect(
      resolveNotificationSettings({ notifications: { mode: 'auto', templateLanguage: 'es_CO' } }),
    ).toMatchObject({ mode: 'auto', templateLanguage: 'es_CO', maxBusinessInitiatedPerOrder: 6 });
  });
});
