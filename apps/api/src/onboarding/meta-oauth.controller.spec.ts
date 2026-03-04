import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import type { Response } from 'express';

/**
 * Unit tests for MetaOAuthController
 * GAP-3 additions: AC-06, AC-07 (HTML postMessage), AC-08 (DASHBOARD_URL targetOrigin)
 */
describe('MetaOAuthController', () => {
  let controller: MetaOAuthController;

  const MOCK_DASHBOARD_URL = 'http://localhost:3001';

  const mockOAuthService = {
    startOnboarding: jest.fn(),
    handleCallback: jest.fn(),
    retryWebhookSubscription: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      if (key === 'DASHBOARD_URL') return MOCK_DASHBOARD_URL;
      return defaultVal ?? undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaOAuthController],
      providers: [
        {
          provide: MetaOAuthService,
          useValue: mockOAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true }) // Bypass guard for unit tests
      .compile();

    controller = module.get<MetaOAuthController>(MetaOAuthController);

    jest.clearAllMocks();
    // Re-apply mock after clearAllMocks
    mockConfigService.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'DASHBOARD_URL') return MOCK_DASHBOARD_URL;
      return defaultVal ?? undefined;
    });
  });

  describe('start', () => {
    it('should set state cookie and redirect to Meta OAuth URL', async () => {
      const mockReq = {
        merchant: { id: 'merchant-123' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
      } as unknown as Response;

      mockOAuthService.startOnboarding.mockReturnValue({
        state: 'test-state-uuid',
        authUrl: 'https://facebook.com/oauth',
      });

      await controller.start(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'meta_oauth_state',
        'test-state-uuid',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
        }),
      );
      expect(mockRes.redirect).toHaveBeenCalledWith(302, 'https://facebook.com/oauth');
    });

    it('should throw if merchant not attached', async () => {
      const mockReq = {} as unknown as AuthenticatedRequest;
      const mockRes = { cookie: jest.fn(), redirect: jest.fn() } as unknown as Response;

      await expect(controller.start(mockReq, mockRes)).rejects.toThrow();
    });
  });

  describe('callback', () => {
    /**
     * AC-06 (GAP-3): Success path → HTML with window.opener.postMessage({ type: 'whatsapp-connected' })
     */
    it('AC-06: should respond with HTML postMessage on successful callback (not redirect)', async () => {
      const sendMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ send: sendMock });

      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: statusMock,
        send: sendMock,
      } as unknown as Response;

      mockOAuthService.handleCallback.mockResolvedValue({
        channelId: 'channel-abc',
        displayName: 'Test Channel',
      });

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(mockRes.redirect).not.toHaveBeenCalled();
      const html = (
        statusMock.mock.calls[0] ? sendMock.mock.calls[0]?.[0] : sendMock.mock.calls[0]?.[0]
      ) as string;
      expect(html).toContain('whatsapp-connected');
      expect(html).toContain('channel-abc');
      expect(html).toContain('window.opener.postMessage');
      expect(html).toContain('window.close');
    });

    /**
     * AC-08 (GAP-3): targetOrigin uses DASHBOARD_URL — never hardcoded '*'
     */
    it('AC-08: should use DASHBOARD_URL as postMessage targetOrigin (never wildcard)', async () => {
      const sendMock = jest.fn();

      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ send: sendMock }),
        send: sendMock,
      } as unknown as Response;

      mockOAuthService.handleCallback.mockResolvedValue({
        channelId: 'channel-abc',
        displayName: 'Test Channel',
      });

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      const html = sendMock.mock.calls[0]?.[0] as string;
      expect(html).toContain(MOCK_DASHBOARD_URL);
      expect(html).not.toContain("'*'");
      expect(html).not.toContain('"*"');
    });

    /**
     * AC-07 (GAP-3): Error path → HTML with whatsapp-error (not redirect, not throw for known errors)
     */
    it('AC-07: should respond with HTML whatsapp-error on callback failure', async () => {
      const sendMock = jest.fn();

      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ send: sendMock }),
        send: sendMock,
      } as unknown as Response;

      mockOAuthService.handleCallback.mockRejectedValue(new Error('Token exchange failed'));

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      const html = sendMock.mock.calls[0]?.[0] as string;
      expect(html).toContain('whatsapp-error');
      expect(html).toContain('invalid_code');
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });

    it('AC-07: should map WABA errors to waba_fetch_failed reason', async () => {
      const sendMock = jest.fn();

      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ send: sendMock }),
        send: sendMock,
      } as unknown as Response;

      mockOAuthService.handleCallback.mockRejectedValue(new Error('Failed to fetch WABA accounts'));

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      const html = sendMock.mock.calls[0]?.[0] as string;
      expect(html).toContain('waba_fetch_failed');
    });

    it('should reject callback with state mismatch (AC-07)', async () => {
      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'state-1' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ send: jest.fn() }),
        send: jest.fn(),
      } as unknown as Response;

      // State mismatch should throw 403 Forbidden (unchanged behavior)
      await expect(controller.callback('test-code', 'state-2', mockReq, mockRes)).rejects.toThrow(
        'Invalid state parameter (CSRF protection)',
      );

      expect(mockRes.clearCookie).toHaveBeenCalledWith('meta_oauth_state');
    });

    it('should respond with error HTML when no code provided', async () => {
      const sendMock = jest.fn();

      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ send: sendMock }),
        send: sendMock,
      } as unknown as Response;

      await controller.callback('' as unknown as string, 'test-state', mockReq, mockRes);

      const html = sendMock.mock.calls[0]?.[0] as string;
      expect(html).toContain('whatsapp-error');
      expect(html).toContain('no_code');
    });

    it('AC-06: HTML should include window.opener guard and fallback', async () => {
      const sendMock = jest.fn();

      const mockReq = {
        merchant: { id: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ send: sendMock }),
        send: sendMock,
      } as unknown as Response;

      mockOAuthService.handleCallback.mockResolvedValue({
        channelId: 'channel-abc',
        displayName: 'Test Channel',
      });

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      const html = sendMock.mock.calls[0]?.[0] as string;
      expect(html).toContain('if (window.opener)');
      expect(html).toContain('window.close()');
    });
  });

  describe('retryWebhookSubscription', () => {
    it('should retry webhook subscription successfully', async () => {
      const mockReq = {
        merchant: { id: 'merchant-123' },
      } as unknown as AuthenticatedRequest;

      mockOAuthService.retryWebhookSubscription.mockResolvedValue({
        success: true,
        message: 'Webhook subscription successful',
      });

      const result = await controller.retryWebhookSubscription('channel-123', mockReq);

      expect(result.success).toBe(true);
      expect(mockOAuthService.retryWebhookSubscription).toHaveBeenCalledWith(
        'channel-123',
        'merchant-123',
      );
    });

    it('should throw if merchant not attached', async () => {
      const mockReq = {} as unknown as AuthenticatedRequest;

      await expect(controller.retryWebhookSubscription('channel-123', mockReq)).rejects.toThrow();
    });
  });
});
