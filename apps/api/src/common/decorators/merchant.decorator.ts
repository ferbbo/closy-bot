import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Merchant } from '@prisma/client';
import { RequestWithMerchant } from '../guards/api-key-auth.guard';

/**
 * Custom decorator to extract authenticated merchant from request
 * Must be used with ApiKeyAuthGuard
 *
 * @example
 * ```typescript
 * @UseGuards(ApiKeyAuthGuard)
 * @Get()
 * async list(@Merchant() merchant: Merchant) {
 *   // merchant is already validated and attached by guard
 * }
 * ```
 */
export const CurrentMerchant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Merchant => {
    const request = ctx.switchToHttp().getRequest<RequestWithMerchant>();
    return request.merchant!;
  },
);
