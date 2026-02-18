import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { verify } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { OidcProvider, OidcTokens, OidcUserInfo } from './oidc-provider.interface';

/**
 * Google OIDC Provider
 * Implements OpenID Connect flow for Google Identity
 */
@Injectable()
export class GoogleOidcProvider implements OidcProvider {
  private readonly logger = new Logger(GoogleOidcProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenEndpoint = 'https://oauth2.googleapis.com/token';
  private readonly jwksUri = 'https://www.googleapis.com/oauth2/v3/certs';
  private readonly jwksClient: jwksClient.JwksClient;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET');

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
      access_type: 'offline',
      prompt: 'consent',
    });

    const url = `${this.authorizationEndpoint}?${params.toString()}`;
    this.logger.debug(`Generated Google authorization URL`);
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
        throw new Error('No ID token received from Google');
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
            issuer: ['https://accounts.google.com', 'accounts.google.com'],
            audience: this.clientId,
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

      if (!payload.email || typeof payload.email !== 'string') {
        throw new Error('Missing required claim: email');
      }

      this.logger.debug(`Verified and extracted user info for sub: ${payload.sub}`);

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name as string | undefined,
      };
    } catch (error) {
      this.logger.error('Failed to extract user info from ID token', error);
      throw new Error('User info extraction failed');
    }
  }
}
