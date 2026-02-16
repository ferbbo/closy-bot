import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { MerchantRepository } from '../../persistence/repositories/merchant.repository';
import { Merchant } from '@prisma/client';

/**
 * Extend Express Request to include merchant
 */
export interface RequestWithMerchant extends Request {
  merchant?: Merchant;
}

/**
 * ApiKeyAuthGuard validates merchant API key from headers
 * Supports both `Authorization: Bearer <key>` and `x-api-key: <key>` formats
 * Attaches resolved merchant to request.merchant
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);

  constructor(private readonly merchantRepository: MerchantRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMerchant>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      this.logger.warn('No API key provided in request');
      throw new UnauthorizedException('API key is required');
    }

    const merchant = await this.merchantRepository.findByApiKey(apiKey);

    if (!merchant) {
      this.logger.warn(`Invalid API key attempted: ${apiKey.substring(0, 8)}...`);
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach merchant to request for use in controllers
    request.merchant = merchant;
    this.logger.log(`Authenticated merchant: ${merchant.id} (${merchant.name})`);

    return true;
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
    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    return undefined;
  }
}
