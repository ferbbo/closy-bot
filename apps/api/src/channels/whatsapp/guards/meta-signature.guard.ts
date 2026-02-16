import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { verifyMetaSignature, maskSecret } from '../utils/signature.util';

/**
 * Guard to validate Meta WhatsApp webhook signatures
 * Verifies X-Hub-Signature-256 header using HMAC SHA-256
 *
 * Requirements:
 * - WHATSAPP_APP_SECRET env var must be set
 * - Request must have rawBody attached (enabled via NestFactory.create options)
 * - X-Hub-Signature-256 header must be present
 *
 * Security:
 * - Uses timing-safe comparison to prevent timing attacks
 * - Logs warnings when secret is not configured (dev mode)
 * - Never logs full secret or payload in logs
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);
  private readonly appSecret: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');

    if (!this.appSecret) {
      this.logger.warn(
        'WHATSAPP_APP_SECRET not configured. Webhook signature validation is DISABLED. ' +
          'This is only acceptable in development environments.',
      );
    } else {
      this.logger.log(`Meta signature guard enabled with secret: ${maskSecret(this.appSecret)}`);
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = request.headers['x-hub-signature-256'] as string | undefined;

    // If no secret is configured, allow request but log warning (dev mode)
    if (!this.appSecret) {
      this.logger.debug('Skipping signature validation (no secret configured)');
      return true;
    }

    // If secret is configured, signature must be present
    if (!signature) {
      this.logger.warn('Webhook request rejected: missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    // Verify signature using raw body
    const rawBody = request.rawBody;
    if (!rawBody) {
      this.logger.error(
        'rawBody not available. Ensure NestFactory.create has rawBody: true option enabled.',
      );
      throw new UnauthorizedException('Unable to verify signature: rawBody not available');
    }

    const isValid = verifyMetaSignature(rawBody, signature, this.appSecret);

    if (!isValid) {
      this.logger.warn(
        `Webhook request rejected: invalid signature. ` +
          `Expected signature starting with: ${signature.substring(0, 15)}...`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug('Webhook signature verified successfully');
    return true;
  }
}
