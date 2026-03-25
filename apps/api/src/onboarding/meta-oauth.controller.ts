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
import { ConfigService } from '@nestjs/config';
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

  constructor(
    private readonly oauthService: MetaOAuthService,
    private readonly configService: ConfigService,
  ) {}

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
   * REQ-06 (GAP-3): Respond with HTML inline that executes window.opener.postMessage + window.close
   * REQ-07 (GAP-3): Error path also returns HTML with whatsapp-error message
   * REQ-08 (GAP-3): Uses DASHBOARD_NEXT_PUBLIC_API_URL env var as targetOrigin (never '*')
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const merchantId = req.merchant.id;
    const dashboardUrl = this.configService.get<string>(
      'DASHBOARD_URL',
      'http://localhost:3001',
    );

    // Validate state (CSRF protection)
    const cookieState = req.cookies[this.cookieName] as string | undefined;
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
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res
        .status(HttpStatus.OK)
        .send(
          this.buildErrorHtml('no_code', 'No se recibió el código de autorización.', dashboardUrl),
        );
      return;
    }

    try {
      // Handle OAuth callback
      const result = await this.oauthService.handleCallback(code, merchantId);

      this.logger.log(
        `OAuth callback successful for merchant ${merchantId}, channel: ${result.channelId}`,
      );

      // REQ-06 (GAP-3): HTML inline with postMessage + window.close
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(HttpStatus.OK).send(this.buildSuccessHtml(result.channelId, dashboardUrl));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `OAuth callback error for merchant ${merchantId}: ${err.message}`,
        err.stack,
      );

      // ConflictException (409) should not be swallowed - rethrow
      if (error instanceof ConflictException) {
        throw error;
      }

      // REQ-07 (GAP-3): Error path → HTML with whatsapp-error
      let reason = 'unknown_error';
      if (err.message.includes('exchange failed')) {
        reason = 'invalid_code';
      } else if (err.message.includes('WABA')) {
        reason = 'waba_fetch_failed';
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(HttpStatus.OK).send(this.buildErrorHtml(reason, err.message, dashboardUrl));
    }
  }

  // ─── HTML builders (REQ-06, REQ-07, REQ-08) ────────────────────────────────

  private buildSuccessHtml(channelId: string, dashboardUrl: string): string {
    const safeChannelId = channelId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeDashboardUrl = dashboardUrl.replace(/'/g, '');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Conectando WhatsApp...</title>
</head>
<body>
  <p>Conectando WhatsApp...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(
        { type: 'whatsapp-connected', channelId: '${safeChannelId}', timestamp: Date.now() },
        '${safeDashboardUrl}'
      );
      setTimeout(function() { window.close(); }, 500);
    } else {
      document.body.innerHTML = '<p>&#x2705; WhatsApp conectado. Vuelve al dashboard y refresca la p&aacute;gina.</p>';
    }
  </script>
</body>
</html>`;
  }

  private buildErrorHtml(reason: string, _message: string, dashboardUrl: string): string {
    const safeReason = reason.replace(/[^a-zA-Z0-9_]/g, '');
    const safeDashboardUrl = dashboardUrl.replace(/'/g, '');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error al conectar WhatsApp</title>
</head>
<body>
  <p>Error al conectar WhatsApp.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(
        { type: 'whatsapp-error', reason: '${safeReason}', timestamp: Date.now() },
        '${safeDashboardUrl}'
      );
      setTimeout(function() { window.close(); }, 500);
    } else {
      document.body.innerHTML = '<p>&#x274C; Error al conectar WhatsApp. Cierra esta ventana y vuelve a intentarlo.</p>';
    }
  </script>
</body>
</html>`;
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
