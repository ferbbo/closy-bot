import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import type { Request, Response } from 'express';

/**
 * Unit tests for MetaOAuthController
 */
describe('MetaOAuthController', () => {
  let controller: MetaOAuthController;

  const mockOAuthService = {
    startOnboarding: jest.fn(),
    handleCallback: jest.fn(),
    retryWebhookSubscription: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaOAuthController],
      providers: [
        {
          provide: MetaOAuthService,
          useValue: mockOAuthService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true }) // Bypass guard for unit tests
      .compile();

    controller = module.get<MetaOAuthController>(MetaOAuthController);

    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should set state cookie and redirect to Meta OAuth URL', async () => {
      const mockReq = {
        session: { merchantId: 'merchant-123' },
      } as unknown as Request;

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

    it('should throw ForbiddenException if no merchant session', async () => {
      const mockReq = {} as unknown as Request;
      const mockRes = {} as unknown as Response;

      await expect(controller.start(mockReq, mockRes)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('callback', () => {
    it('should handle successful callback and redirect to dashboard', async () => {
      const mockReq = {
        session: { merchantId: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as Request;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
      } as unknown as Response;

      mockOAuthService.handleCallback.mockResolvedValue({
        channelId: 'channel-123',
        displayName: 'Test Channel',
      });

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('meta_oauth_state');
      expect(mockRes.redirect).toHaveBeenCalledWith(302, expect.stringContaining('status=success'));
      expect(mockRes.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('channelId=channel-123'),
      );
    });

    it('should reject callback with state mismatch (AC-07)', async () => {
      const mockReq = {
        session: { merchantId: 'merchant-123' },
        cookies: { meta_oauth_state: 'state-1' },
      } as unknown as Request;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
      } as unknown as Response;

      // AC-07: State mismatch should throw 403 Forbidden
      await expect(
        controller.callback('test-code', 'state-2', mockReq, mockRes),
      ).rejects.toThrow('Invalid state parameter (CSRF protection)');

      expect(mockRes.clearCookie).toHaveBeenCalledWith('meta_oauth_state');
    });

    it('should handle callback error and redirect with error reason', async () => {
      const mockReq = {
        session: { merchantId: 'merchant-123' },
        cookies: { meta_oauth_state: 'test-state' },
      } as unknown as Request;

      const mockRes = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
      } as unknown as Response;

      mockOAuthService.handleCallback.mockRejectedValue(new Error('Token exchange failed'));

      await controller.callback('test-code', 'test-state', mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(302, expect.stringContaining('status=error'));
    });
  });

  describe('retryWebhookSubscription', () => {
    it('should retry webhook subscription successfully', async () => {
      const mockReq = {
        session: { merchantId: 'merchant-123' },
      } as unknown as Request;

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

    it('should throw ForbiddenException if no merchant session', async () => {
      const mockReq = {} as unknown as Request;

      await expect(controller.retryWebhookSubscription('channel-123', mockReq)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
