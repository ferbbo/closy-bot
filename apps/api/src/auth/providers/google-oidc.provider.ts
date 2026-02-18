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
      // Decode JWT without verification (verification done by provider)
      // In production, should verify signature using Google's JWKS
      const decoded = decode(idToken) as IdTokenClaims | null;

      if (!decoded || !decoded.sub || !decoded.email) {
        throw new Error('Invalid ID token structure');
      }

      this.logger.debug(`Extracted user info for sub: ${decoded.sub}`);

      return {
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name,
      };
    } catch (error) {
      this.logger.error('Failed to extract user info from ID token', error);
      throw new Error('User info extraction failed');
    }
  }
}
