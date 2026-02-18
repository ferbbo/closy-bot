import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { decode } from 'jsonwebtoken';
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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
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
      // TODO(security): Implement JWKS verification for production
      // For now, decode and validate structure/expiry
      const decoded = decode(idToken, { complete: true }) as {
        payload: Record<string, unknown>;
      } | null;

      if (!decoded || !decoded.payload) {
        throw new Error('Invalid ID token structure');
      }

      const payload = decoded.payload;

      // Verify required claims
      if (!payload.sub || !payload.email) {
        throw new Error('Missing required claims (sub, email)');
      }

      // Verify issuer
      if (!payload.iss || !payload.iss.includes('accounts.google.com')) {
        throw new Error('Invalid issuer');
      }

      // Verify audience (client_id)
      if (payload.aud !== this.clientId) {
        throw new Error('Invalid audience');
      }

      // Verify expiry
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }

      this.logger.debug(`Extracted user info for sub: ${payload.sub}`);

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
      };
    } catch (error) {
      this.logger.error('Failed to extract user info from ID token', error);
      throw new Error('User info extraction failed');
    }
  }
}
