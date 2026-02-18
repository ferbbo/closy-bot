import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { GoogleOidcProvider } from './google-oidc.provider';

describe('GoogleOidcProvider (AC-02, AC-03)', () => {
  let provider: GoogleOidcProvider;
  let httpService: HttpService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOidcProvider,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'GOOGLE_CLIENT_ID') return 'test-client-id';
              if (key === 'GOOGLE_CLIENT_SECRET') return 'test-secret';
              return '';
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<GoogleOidcProvider>(GoogleOidcProvider);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('AC-02: getAuthorizationUrl', () => {
    it('should generate valid URL with state and redirect_uri', () => {
      const state = 'test-state-123';
      const redirectUri = 'http://localhost:3000/auth/callback/google';

      const url = provider.getAuthorizationUrl(state, redirectUri);

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('scope=openid');
      expect(url).toContain('email');
      expect(url).toContain('profile');
    });
  });

  describe('AC-03: exchangeCodeForTokens', () => {
    it('should call token endpoint and return tokens', async () => {
      const mockResponse = {
        data: {
          id_token: 'mock-id-token',
          access_token: 'mock-access-token',
        },
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse) as any);

      const result = await provider.exchangeCodeForTokens(
        'test-code',
        'http://localhost:3000/auth/callback/google',
      );

      expect(result).toEqual({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
      });
    });
  });
});
