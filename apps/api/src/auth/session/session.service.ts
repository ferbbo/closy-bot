import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Merchant, Session } from '@prisma/client';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { SessionStore } from './session-store.interface';

/**
 * Session Service
 * Handles session lifecycle: creation, validation, cleanup
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly ttlHours: number;

  constructor(
    @Inject('SessionStore') private readonly sessionStore: SessionStore,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.ttlHours = this.configService.get<number>('AUTH_SESSION_TTL_HOURS', 24);
  }

  /**
   * Create a new session for a merchant
   */
  async create(
    merchantId: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<Session> {
    this.logger.debug(`Creating session for merchant ${merchantId}`);
    return this.sessionStore.create(merchantId, this.ttlHours, metadata);
  }

  /**
   * Validate session and return merchant if valid
   * Returns null if session not found or expired
   */
  async validate(sessionId: string): Promise<Merchant | null> {
    const session = await this.sessionStore.findBySessionId(sessionId);

    if (!session) {
      this.logger.debug(`Session ${sessionId} not found or expired`);
      return null;
    }

    // Check expiry again (defensive)
    if (session.expiresAt < new Date()) {
      this.logger.debug(`Session ${sessionId} expired`);
      return null;
    }

    // Load merchant
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: session.merchantId },
    });

    if (!merchant) {
      this.logger.warn(`Merchant ${session.merchantId} not found for valid session`);
      return null;
    }

    return merchant;
  }

  /**
   * Invalidate (delete) a session
   */
  async invalidate(sessionId: string): Promise<void> {
    this.logger.debug(`Invalidating session ${sessionId}`);
    await this.sessionStore.deleteBySessionId(sessionId);
  }

  /**
   * Cleanup expired sessions (called by scheduled job)
   */
  async cleanupExpired(): Promise<number> {
    this.logger.log('Running session cleanup job');
    return this.sessionStore.deleteExpired();
  }
}
