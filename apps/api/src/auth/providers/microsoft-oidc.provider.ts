import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { decode } from 'jsonwebtoken';
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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('MICROSOFT_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET');

    // Microsoft Identity Platform v2.0 endpoints
    this.authorizationEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`;
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
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
      // Decode JWT without verification (verification done by provider)
      // In production, should verify signature using Microsoft's JWKS
      const decoded = decode(idToken) as IdTokenClaims | null;

      if (!decoded || !decoded.sub || !decoded.email) {
        // Microsoft uses 'preferred_username' as email for some accounts
        const email = decoded.email || decoded.preferred_username;
        if (!decoded.sub || !email) {
          throw new Error('Invalid ID token structure');
        }
      }

      this.logger.debug(`Extracted user info for sub: ${decoded.sub}`);

      return {
        sub: decoded.sub,
        email: decoded.email || decoded.preferred_username,
        name: decoded.name,
      };
    } catch (error) {
      this.logger.error('Failed to extract user info from ID token', error);
      throw new Error('User info extraction failed');
    }
  }
}
