import { Request } from 'express';
import { Merchant } from '@prisma/client';

/**
 * Authenticated Request
 * Request object with merchant attached by SessionAuthGuard
 */
export interface AuthenticatedRequest extends Request {
  merchant: Merchant;
}
