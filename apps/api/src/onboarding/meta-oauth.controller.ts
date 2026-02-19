import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
  ForbiddenException,
  ConflictException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { MetaOAuthService } from './meta-oauth.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { WebhookSubscriptionResponseDto } from './dto/channel-onboarding.response.dto';

/**
 * Controller for Meta Embedded Signup OAuth flow
 *
 * REQ-04: Start endpoint with redirect + state cookie
 * REQ-05: Callback endpoint with exchange + create Channel
 * REQ-07: Retry webhook subscription endpoint
 * REQ-08: SessionAuthGuard on all endpoints
 */
@Controller('onboarding/whatsapp')
@UseGuards(SessionAuthGuard) // REQ-08: AC-11 - All endpoints require auth
export class MetaOAuthController {
  private readonly logger = new Logger(MetaOAuthController.name);
  private readonly cookieName = 'meta_oauth_state';
  private readonly cookieTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly oauthService: MetaOAuthService) {}

  /**
   * Start OAuth flow
   * REQ-04: AC-04 - Redirect to Meta + set state cookie
   * AC-05: State cookie has correct attributes (httpOnly, Secure in prod, 5min TTL)
   */
  @Get('start')
  async start(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const merchantId = req.merchant.id;

    const { state, authUrl } = this.oauthService.startOnboarding();

    // Set state cookie (httpOnly, Secure in production)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(this.cookieName, state, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: this.cookieTtlMs,
    });

    this.logger.log(`OAuth start for merchant ${merchantId}, redirecting to Meta`);

    // Redirect to Meta OAuth
    res.redirect(HttpStatus.FOUND, authUrl);
  }

  /**
   * OAuth callback handler
   * REQ-05: AC-06 - Exchange code and create Channel
   * AC-07: State mismatch -> 403 Forbidden
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const merchantId = req.merchant.id;

    // Validate state (CSRF protection)
    const cookieState = req.cookies[this.cookieName];
    if (!cookieState || cookieState !== state) {
      this.logger.warn(
        `State mismatch for merchant ${merchantId}: cookie=${cookieState}, query=${state}`,
      );
      // AC-07: State mismatch -> 403 Forbidden
      res.clearCookie(this.cookieName);
      throw new ForbiddenException('Invalid state parameter (CSRF protection)');
    }

    // Clear state cookie
    res.clearCookie(this.cookieName);

    if (!code) {
      this.logger.error(`No code provided in callback for merchant ${merchantId}`);
      res.redirect(HttpStatus.FOUND, '/dashboard?status=error&reason=no_code');
      return;
    }

    try {
      // Handle OAuth callback
      const result = await this.oauthService.handleCallback(code, merchantId);

      this.logger.log(
        `OAuth callback successful for merchant ${merchantId}, channel: ${result.channelId}`,
      );

      // Redirect to dashboard with success
      res.redirect(HttpStatus.FOUND, `/dashboard?status=success&channelId=${result.channelId}`);
    } catch (error) {
      this.logger.error(
        `OAuth callback error for merchant ${merchantId}: ${error.message}`,
        error.stack,
      );

      // AC-12: ConflictException (409) should not redirect - let exception filter handle it
      // Rethrow known exceptions to maintain proper HTTP status codes
      if (error instanceof ConflictException) {
        throw error;
      }

      // Handle other errors with redirect
      let reason = 'unknown_error';
      if (error.message.includes('exchange failed')) {
        reason = 'invalid_code';
      } else if (error.message.includes('WABA')) {
        reason = 'waba_fetch_failed';
      }

      res.redirect(HttpStatus.FOUND, `/dashboard?status=error&reason=${reason}`);
    }
  }

  /**
   * Retry webhook subscription manually
   * REQ-07: AC-10 - Retry endpoint should work
   * Rate limited to prevent abuse (5 requests per minute per merchant)
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':channelId/subscribe-webhook')
  async retryWebhookSubscription(
    @Param('channelId') channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WebhookSubscriptionResponseDto> {
    const merchantId = req.merchant.id;

    this.logger.log(
      `Webhook subscription retry for channel ${channelId} by merchant ${merchantId}`,
    );

    const result = await this.oauthService.retryWebhookSubscription(channelId, merchantId);
    return result;
  }
}
