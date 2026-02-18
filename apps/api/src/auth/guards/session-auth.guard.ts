import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/**
 * Session Auth Guard
 * Validates session cookie and attaches merchant to request
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.cookies?.['session_id'];

    if (!sessionId) {
      this.logger.debug('No session cookie found');
      throw new UnauthorizedException('Authentication required');
    }

    const merchant = await this.sessionService.validate(sessionId);

    if (!merchant) {
      this.logger.debug(`Invalid or expired session: ${sessionId}`);
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Attach merchant to request for downstream use
    (request as AuthenticatedRequest).merchant = merchant;

    return true;
  }
}
