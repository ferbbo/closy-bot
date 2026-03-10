import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionService } from './session/session.service';
import { GoogleOidcProvider } from './providers/google-oidc.provider';
import { MicrosoftOidcProvider } from './providers/microsoft-oidc.provider';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OidcProvider as PrismaOidcProvider } from '@prisma/client';
import { GenericPlaybookDefaults } from '../domain/entities/playbook-defaults/generic.config';

describe('AuthService (AC-08, AC-09)', () => {
  let service: AuthService;
  let googleProvider: GoogleOidcProvider;
  let prismaService: PrismaService;
  let sessionService: SessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            merchantIdentity: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            merchant: {
              findFirst: jest.fn(),
              create: jest.fn(),
            },
          },
        },
        {
          provide: SessionService,
          useValue: {
            create: jest.fn(),
            validate: jest.fn(),
            invalidate: jest.fn(),
          },
        },
        {
          provide: GoogleOidcProvider,
          useValue: {
            getAuthorizationUrl: jest.fn(),
            exchangeCodeForTokens: jest.fn(),
            getUserInfo: jest.fn(),
          },
        },
        {
          provide: MicrosoftOidcProvider,
          useValue: {
            getAuthorizationUrl: jest.fn(),
            exchangeCodeForTokens: jest.fn(),
            getUserInfo: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn(() => 'http://localhost:3000'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    googleProvider = module.get<GoogleOidcProvider>(GoogleOidcProvider);
    prismaService = module.get<PrismaService>(PrismaService);
    sessionService = module.get<SessionService>(SessionService);
  });

  describe('AC-08: startLogin generates state, sets cookie, returns redirect URL', () => {
    it('should return redirect URL and state', () => {
      const mockUrl = 'https://accounts.google.com/oauth?state=xyz';
      jest.spyOn(googleProvider, 'getAuthorizationUrl').mockReturnValue(mockUrl);

      const result = service.startLogin('google');

      expect(result.redirectUrl).toBe(mockUrl);
      expect(result.state).toBeDefined();
      expect(result.state.length).toBeGreaterThan(10);
    });
  });

  describe('AC-09: handleCallback validates state, exchanges code, links merchant, creates session', () => {
    it('should reject if state mismatch (CSRF check)', async () => {
      await expect(
        service.handleCallback('google', 'code123', 'wrong-state', 'expected-state'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create session and return merchant on success', async () => {
      const mockTokens = { idToken: 'id-token' };
      const mockUserInfo = { sub: 'google-sub-123', email: 'user@example.com', name: 'Test User' };
      const mockMerchant = {
        id: 'merchant-1',
        name: 'Test Merchant',
        whatsappNumber: 'user@example.com',
        apiKey: 'key123',
        industry: null,
        playbookConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockIdentity = {
        id: 'identity-1',
        merchantId: 'merchant-1',
        provider: PrismaOidcProvider.GOOGLE,
        oidcSubject: 'google-sub-123',
        email: 'user@example.com',
        createdAt: new Date(),
        merchant: mockMerchant,
      };
      const mockSession = {
        id: 'session-1',
        sessionId: 'uuid-session',
        merchantId: 'merchant-1',
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      jest.spyOn(googleProvider, 'exchangeCodeForTokens').mockResolvedValue(mockTokens);
      jest.spyOn(googleProvider, 'getUserInfo').mockResolvedValue(mockUserInfo);
      jest.spyOn(prismaService.merchantIdentity, 'findUnique').mockResolvedValue(mockIdentity);
      jest.spyOn(sessionService, 'create').mockResolvedValue(mockSession);

      const result = await service.handleCallback(
        'google',
        'code123',
        'state-match',
        'state-match',
        {
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
        },
      );

      expect(result.sessionId).toBe('uuid-session');
      expect(result.merchant.id).toBe('merchant-1');
      expect(sessionService.create).toHaveBeenCalledWith('merchant-1', {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      });
    });

    it('AC-05: should create new merchant with retail_general industry and playbookConfig on first login', async () => {
      const mockTokens = { idToken: 'id-token' };
      const mockUserInfo = { sub: 'new-sub-123', email: 'new@example.com', name: 'New User' };
      const mockNewMerchant = {
        id: 'merchant-new',
        name: 'New User',
        whatsappNumber: 'new@example.com',
        apiKey: 'new-key',
        industry: 'retail_general',
        playbookConfig: GenericPlaybookDefaults,
        botPaused: false,
        status: 'onboarding',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockSession = {
        id: 'session-2',
        sessionId: 'uuid-session-new',
        merchantId: 'merchant-new',
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      jest.spyOn(googleProvider, 'exchangeCodeForTokens').mockResolvedValue(mockTokens);
      jest.spyOn(googleProvider, 'getUserInfo').mockResolvedValue(mockUserInfo);
      jest.spyOn(prismaService.merchantIdentity, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prismaService.merchant, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.merchant, 'create').mockResolvedValue(mockNewMerchant as never);
      jest.spyOn(prismaService.merchantIdentity, 'create').mockResolvedValue({} as never);
      jest.spyOn(sessionService, 'create').mockResolvedValue(mockSession);

      await service.handleCallback('google', 'code123', 'state-x', 'state-x');

      expect(prismaService.merchant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          industry: 'retail_general',
          playbookConfig: expect.objectContaining({ industry: 'retail_general' }),
        }),
      });
    });
  });
});
