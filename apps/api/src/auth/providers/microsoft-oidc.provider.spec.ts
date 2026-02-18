import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { MicrosoftOidcProvider } from './microsoft-oidc.provider';

describe('MicrosoftOidcProvider (AC-04, AC-05)', () => {
  let provider: MicrosoftOidcProvider;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftOidcProvider,
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
              if (key === 'MICROSOFT_CLIENT_ID') return 'test-ms-client-id';
              if (key === 'MICROSOFT_CLIENT_SECRET') return 'test-ms-secret';
              return '';
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<MicrosoftOidcProvider>(MicrosoftOidcProvider);
    httpService = module.get<HttpService>(HttpService);
  });

  describe('AC-04: getAuthorizationUrl', () => {
    it('should generate valid URL', () => {
      const state = 'test-state-456';
      const redirectUri = 'http://localhost:3000/auth/callback/microsoft';

      const url = provider.getAuthorizationUrl(state, redirectUri);

      expect(url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(url).toContain('client_id=test-ms-client-id');
    });
  });

  describe('AC-05: exchangeCodeForTokens', () => {
    it('should work correctly', async () => {
      const mockResponse = {
        data: {
          id_token: 'mock-ms-id-token',
          access_token: 'mock-ms-access-token',
        },
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse) as any);

      const result = await provider.exchangeCodeForTokens(
        'test-code-ms',
        'http://localhost:3000/auth/callback/microsoft',
      );

      expect(result.idToken).toBe('mock-ms-id-token');
      expect(result.accessToken).toBe('mock-ms-access-token');
    });
  });
});
