import { Controller, Get, Post, Query, Param, Res, Req, UseGuards, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthMeResponseDto } from './dto/auth-me.response.dto';
import { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

/**
 * Auth Controller
 * Handles OIDC login, callback, me, logout endpoints
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly cookieDomain?: string;
  private readonly isProduction: boolean;

  constructor(private readonly authService: AuthService) {
    this.cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * GET /auth/login/:provider
   * Redirect to OIDC provider authorization URL
   */
  @Get('login/:provider')
  async login(@Param('provider') provider: string, @Res() res: Response): Promise<void> {
    this.logger.log(`Login request for provider: ${provider}`);

    const { redirectUrl, state } = this.authService.startLogin(provider);

    // Set state cookie for CSRF protection (5 min TTL)
    res.cookie('oidc_state', state, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000, // 5 minutes
      // domain: this.cookieDomain,
    });

    // Redirect to provider
    res.redirect(redirectUrl);
  }

  /**
   * GET /auth/callback/:provider
   * Handle OIDC callback, create session, redirect to dashboard
   */
  @Get('callback/:provider')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Callback from provider: ${provider}`);

    const expectedState = req.cookies?.['oidc_state'];

    if (!code) {
      this.logger.error('No authorization code received');
      res.status(400).send('Missing authorization code');
      return;
    }

    if (!expectedState) {
      this.logger.error('No state cookie found');
      res.status(403).send('Missing state cookie (CSRF check failed)');
      return;
    }

    try {
      const { sessionId, merchant } = await this.authService.handleCallback(
        provider,
        code,
        state,
        expectedState,
        {
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
        },
      );

      // Clear state cookie
      res.clearCookie('oidc_state', { domain: this.cookieDomain });

      // Set session cookie (24h by default)
      res.cookie('session_id', sessionId, {
        httpOnly: true,
        secure: this.isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        domain: this.cookieDomain,
      });

      this.logger.log(`Session created for merchant: ${merchant.id}`);

      // Redirect to dashboard (or configured URL)
      res.redirect('/dashboard');
    } catch (error) {
      this.logger.error('Callback failed', error);

      // Clear state cookie on error
      res.clearCookie('oidc_state', { domain: this.cookieDomain });

      const errorResponse = error as { status?: number; message: string };
      res.status(errorResponse.status || 500).send(errorResponse.message);
      return;
    }
  }

  /**
   * GET /auth/me
   * Get current authenticated merchant
   */
  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<AuthMeResponseDto> {
    const merchant = req.merchant;

    return {
      authenticated: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.whatsappNumber, // TODO: proper email field
        status: merchant.status,
      },
    };
  }

  /**
   * POST /auth/logout
   * Invalidate session and clear cookie
   */
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const sessionId = req.cookies?.['session_id'];

    if (sessionId) {
      await this.authService.logout(sessionId);
      this.logger.log(`Logged out session: ${sessionId}`);
    }

    // Clear session cookie
    res.clearCookie('session_id', { domain: this.cookieDomain });

    res.status(200).json({ success: true });
  }
}
