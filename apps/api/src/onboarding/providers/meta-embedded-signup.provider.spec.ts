import { MetaEmbeddedSignupProvider } from './meta-embedded-signup.provider';

/**
 * Unit tests for MetaEmbeddedSignupProvider
 * AC-02: should generate auth URL
 * AC-03: should exchange code for token
 */
describe('AC-02, AC-03: MetaEmbeddedSignupProvider', () => {
  let provider: MetaEmbeddedSignupProvider;
  const appId = 'test-app-id';
  const appSecret = 'test-app-secret';
  const configId = 'test-config-id';

  beforeEach(() => {
    provider = new MetaEmbeddedSignupProvider(appId, appSecret, configId);
  });

  describe('AC-02: getAuthorizationUrl', () => {
    it('should generate valid OAuth URL with state', () => {
      const state = 'test-state-uuid';
      const redirectUri = 'http://localhost:3000/callback';

      const authUrl = provider.getAuthorizationUrl(state, redirectUri);

      expect(authUrl).toContain('facebook.com');
      expect(authUrl).toContain('oauth');
      expect(authUrl).toContain(`client_id=${appId}`);
      expect(authUrl).toContain(`config_id=${configId}`);
      expect(authUrl).toContain(`state=${state}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(authUrl).toContain('whatsapp_business_management');
    });
  });

  describe('AC-03: exchangeCodeForToken', () => {
    it('should exchange code for access_token (mocked)', async () => {
      const code = 'test-code';
      const redirectUri = 'http://localhost:3000/callback';

      // Mock global fetch
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          token_type: 'bearer',
        }),
      } as Response);

      const result = await provider.exchangeCodeForToken(code, redirectUri);

      expect(result.access_token).toBe('mock-access-token');
      expect(result.token_type).toBe('bearer');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('oauth/access_token'),
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should throw error on failed token exchange', async () => {
      const code = 'invalid-code';
      const redirectUri = 'http://localhost:3000/callback';

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      } as Response);

      await expect(provider.exchangeCodeForToken(code, redirectUri)).rejects.toThrow(
        'Meta API token exchange failed',
      );
    });
  });

  describe('fetchWabaInfo', () => {
    it('should fetch WABA info successfully', async () => {
      const accessToken = 'test-token';
      const wabaId = 'test-waba-id';

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: wabaId,
          name: 'Test WABA',
          phone_numbers: {
            data: [
              {
                id: 'phone-123',
                display_phone_number: '+573001234567',
                verified_name: 'Test Business',
              },
            ],
          },
        }),
      } as Response);

      const result = await provider.fetchWabaInfo(accessToken, wabaId);

      expect(result.id).toBe(wabaId);
      expect(result.name).toBe('Test WABA');
      expect(result.phone_numbers).toHaveLength(1);
      expect(result.phone_numbers[0].id).toBe('phone-123');
    });
  });

  describe('AC-09: subscribeWebhook', () => {
    it('should subscribe webhook successfully', async () => {
      const wabaId = 'test-waba-id';
      const accessToken = 'test-token';
      const callbackUrl = 'https://example.com/webhook';
      const verifyToken = 'verify-token';

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const result = await provider.subscribeWebhook(wabaId, accessToken, callbackUrl, verifyToken);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/${wabaId}/subscribed_apps`),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(callbackUrl),
        }),
      );
    });

    it('should handle webhook subscription failure', async () => {
      const wabaId = 'test-waba-id';
      const accessToken = 'test-token';

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      } as Response);

      const result = await provider.subscribeWebhook(wabaId, accessToken, '', '');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
