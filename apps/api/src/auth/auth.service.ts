import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Merchant, OidcProvider as PrismaOidcProvider } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { SessionService } from './session/session.service';
import { OidcProvider } from './providers/oidc-provider.interface';
import { GoogleOidcProvider } from './providers/google-oidc.provider';
import { MicrosoftOidcProvider } from './providers/microsoft-oidc.provider';
import { v4 as uuidv4 } from 'uuid';

/**
 * Auth Service
 * Orchestrates OIDC login flow: redirect, callback, merchant linking, session
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redirectBaseUrl: string;
  private readonly providers: Map<string, OidcProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly googleProvider: GoogleOidcProvider,
    private readonly microsoftProvider: MicrosoftOidcProvider,
    private readonly configService: ConfigService,
  ) {
    this.redirectBaseUrl = this.configService.getOrThrow<string>('AUTH_REDIRECT_URL');

    // Register providers
    this.providers = new Map<string, OidcProvider>([
      ['google', this.googleProvider],
      ['microsoft', this.microsoftProvider],
    ]);
  }

  /**
   * Start OIDC login flow
   * @returns Authorization URL and state cookie value
   */
  startLogin(providerName: string): { redirectUrl: string; state: string } {
    const provider = this.getProvider(providerName);
    const state = uuidv4();
    const redirectUri = `${this.redirectBaseUrl}/auth/callback/${providerName}`;

    const redirectUrl = provider.getAuthorizationUrl(state, redirectUri);

    this.logger.debug(`Started ${providerName} login flow with state: ${state}`);

    return { redirectUrl, state };
  }

  /**
   * Handle OIDC callback
   * Exchange code, link merchant, create session
   */
  async handleCallback(
    providerName: string,
    code: string,
    receivedState: string,
    expectedState: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ sessionId: string; merchant: Merchant }> {
    // Validate CSRF state
    if (receivedState !== expectedState) {
      this.logger.warn(`State mismatch: expected ${expectedState}, got ${receivedState}`);
      throw new ForbiddenException('Invalid state parameter (CSRF check failed)');
    }

    const provider = this.getProvider(providerName);
    const redirectUri = `${this.redirectBaseUrl}/auth/callback/${providerName}`;

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await provider.exchangeCodeForTokens(code, redirectUri);
    } catch (error) {
      this.logger.error(`Token exchange failed for ${providerName}`, error);
      throw new BadRequestException('Authorization code exchange failed');
    }

    // Extract user info from ID token
    let userInfo;
    try {
      userInfo = await provider.getUserInfo(tokens.idToken);
    } catch (error) {
      this.logger.error(`User info extraction failed for ${providerName}`, error);
      throw new BadRequestException('Failed to extract user information');
    }

    const { sub, email, name } = userInfo;
    const prismaProvider = this.mapProviderName(providerName);

    // Find or create merchant identity
    const identity = await this.prisma.merchantIdentity.findUnique({
      where: {
        provider_oidcSubject: {
          provider: prismaProvider,
          oidcSubject: sub,
        },
      },
      include: { merchant: true },
    });

    let merchant: Merchant;

    if (identity) {
      // Existing identity
      merchant = identity.merchant;
      this.logger.debug(`Found existing identity for ${email}, merchant: ${merchant.id}`);
    } else {
      // New identity: find or create merchant by email
      let existingMerchant = await this.prisma.merchant.findFirst({
        where: { whatsappNumber: email }, // Using whatsappNumber as temporary email field
      });

      if (!existingMerchant) {
        // Create new merchant
        existingMerchant = await this.prisma.merchant.create({
          data: {
            name: name || email,
            whatsappNumber: email, // TODO: proper email field in future
            apiKey: uuidv4(), // Generate unique API key
          },
        });
        this.logger.log(`Created new merchant ${existingMerchant.id} for ${email}`);
      }

      merchant = existingMerchant;

      // Link identity to merchant
      await this.prisma.merchantIdentity.create({
        data: {
          merchantId: merchant.id,
          provider: prismaProvider,
          oidcSubject: sub,
          email,
        },
      });

      this.logger.log(`Linked ${providerName} identity (${email}) to merchant ${merchant.id}`);
    }

    // Create session
    const session = await this.sessionService.create(merchant.id, metadata);

    this.logger.log(`Created session ${session.sessionId} for merchant ${merchant.id}`);

    return {
      sessionId: session.sessionId,
      merchant,
    };
  }

  /**
   * Validate session and return merchant
   */
  async validateSession(sessionId: string): Promise<Merchant | null> {
    return this.sessionService.validate(sessionId);
  }

  /**
   * Logout (invalidate session)
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessionService.invalidate(sessionId);
    this.logger.debug(`Logged out session ${sessionId}`);
  }

  /**
   * Get provider by name or throw
   */
  private getProvider(name: string): OidcProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new NotFoundException(`Unknown provider: ${name}`);
    }
    return provider;
  }

  /**
   * Map provider name to Prisma enum
   */
  private mapProviderName(name: string): PrismaOidcProvider {
    switch (name.toLowerCase()) {
      case 'google':
        return PrismaOidcProvider.GOOGLE;
      case 'microsoft':
        return PrismaOidcProvider.MICROSOFT;
      default:
        throw new NotFoundException(`Unknown provider: ${name}`);
    }
  }
}
