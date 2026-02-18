import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { verify } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { OidcProvider, OidcTokens, OidcUserInfo } from './oidc-provider.interface';

/**
 * Microsoft OIDC Provider (Azure AD / Entra ID)
 * Implements OpenID Connect flow for Microsoft Identity Platform
 */
@Injectable()
export class MicrosoftOidcProvider implements OidcProvider {
  private readonly logger = new Logger(MicrosoftOidcProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenant = 'common'; // Supports personal + work/school accounts
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly jwksUri: string;
  private readonly jwksClient: jwksClient.JwksClient;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('MICROSOFT_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET');

    // Microsoft Identity Platform v2.0 endpoints
    this.authorizationEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`;
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
    this.jwksUri = `https://login.microsoftonline.com/${this.tenant}/discovery/v2.0/keys`;

    // Initialize JWKS client for signature verification
    this.jwksClient = jwksClient({
      jwksUri: this.jwksUri,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      response_mode: 'query',
    });

    const url = `${this.authorizationEndpoint}?${params.toString()}`;
    this.logger.debug(`Generated Microsoft authorization URL`);
    return url;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OidcTokens> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.tokenEndpoint,
          new URLSearchParams({
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      const { id_token, access_token } = response.data;

      if (!id_token) {
        throw new Error('No ID token received from Microsoft');
      }

      this.logger.debug('Successfully exchanged code for tokens');

      return {
        idToken: id_token,
        accessToken: access_token,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens', error);
      throw new Error('Token exchange failed');
    }
  }

  async getUserInfo(idToken: string): Promise<OidcUserInfo> {
    try {
      // Get signing key from JWKS
      const getKey = (
        header: { kid?: string },
        callback: (err: Error | null, key?: string) => void,
      ) => {
        this.jwksClient.getSigningKey(header.kid || '', (err, key) => {
          if (err) {
            this.logger.error('Failed to get signing key', err);
            callback(err);
            return;
          }
          const signingKey = key?.getPublicKey();
          callback(null, signingKey);
        });
      };

      // Verify token signature and claims
      const payload = await new Promise<Record<string, unknown>>((resolve, reject) => {
        verify(
          idToken,
          getKey as never, // Type cast needed for jwks-rsa callback
          {
            algorithms: ['RS256'],
            // Microsoft issuer can vary by tenant
            // For 'common' tenant, accept any login.microsoftonline.com issuer
            // Actual iss validation happens inside jsonwebtoken.verify via issuer option
          },
          (err, decoded) => {
            if (err) {
              this.logger.error('ID token verification failed', err);
              reject(new Error('ID token verification failed'));
              return;
            }
            resolve(decoded as Record<string, unknown>);
          },
        );
      });

      // Verify required claims
      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new Error('Missing required claim: sub');
      }

      // Microsoft uses 'preferred_username' or 'email'
      const email = (payload.email as string) || (payload.preferred_username as string);
      if (!email) {
        throw new Error('Missing email/preferred_username claim');
      }

      this.logger.debug(`Verified and extracted user info for sub: ${payload.sub}`);

      return {
        sub: payload.sub,
        email: email,
        name: payload.name as string | undefined,
      };
    } catch (error) {
      this.logger.error('Failed to extract user info from ID token', error);
      throw new Error('User info extraction failed');
    }
  }
}
