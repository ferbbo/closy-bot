import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { Merchant } from '@prisma/client';
import { MerchantRepository } from '../../persistence/repositories/merchant.repository';
import { SessionService } from '../../auth/session/session.service';

/**
 * Extend Express Request to include merchant
 */
export interface RequestWithMerchant extends Request {
  merchant?: Merchant;
}

/**
 * MerchantAuthGuard - Combined authentication guard
 *
 * Accepts EITHER:
 * - Session cookie (session_id) - for dashboard UI
 * - API Key (x-api-key or Authorization: Bearer) - for external integrations
 *
 * This allows the same endpoints to be used by both the dashboard and external scripts.
 * Session cookie takes precedence if both are present.
 */
@Injectable()
export class MerchantAuthGuard implements CanActivate {
  private readonly logger = new Logger(MerchantAuthGuard.name);

  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMerchant>();

    // Try session cookie first (dashboard users)
    const sessionId = request.cookies?.['session_id'];
    if (sessionId) {
      const merchant = await this.sessionService.validate(sessionId);
      if (merchant) {
        request.merchant = merchant;
        this.logger.debug(`Authenticated via session: ${merchant.id}`);
        return true;
      }
      // Session invalid/expired, try API key as fallback
    }

    // Try API key (external integrations)
    const apiKey = this.extractApiKey(request);
    if (apiKey) {
      const merchant = await this.merchantRepository.findByApiKey(apiKey);
      if (merchant) {
        request.merchant = merchant;
        this.logger.debug(`Authenticated via API key: ${merchant.id}`);
        return true;
      }
    }

    // Neither method worked
    this.logger.debug('No valid authentication method found');
    throw new UnauthorizedException(
      'Authentication required. Provide session_id cookie or x-api-key header.',
    );
  }

  /**
   * Extract API key from Authorization header or x-api-key header
   */
  private extractApiKey(request: Request): string | undefined {
    // Try Authorization: Bearer <key>
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try x-api-key header
    const xApiKey = request.headers['x-api-key'];
    if (typeof xApiKey === 'string') {
      return xApiKey;
    }

    return undefined;
  }
}
