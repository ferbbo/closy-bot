import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { Session } from '@prisma/client';
import { SessionStore } from './session-store.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL Session Store
 * Implements session persistence using Prisma + PostgreSQL
 */
@Injectable()
export class PostgresSessionStore implements SessionStore {
  private readonly logger = new Logger(PostgresSessionStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    merchantId: string,
    ttlHours: number,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<Session> {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        sessionId,
        merchantId,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      },
    });

    this.logger.debug(
      `Created session ${sessionId} for merchant ${merchantId}, expires at ${expiresAt.toISOString()}`,
    );

    return session;
  }

  async findBySessionId(sessionId: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId },
    });

    if (session && session.expiresAt < new Date()) {
      this.logger.debug(`Session ${sessionId} is expired`);
      return null;
    }

    return session;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { sessionId },
    });

    this.logger.debug(`Deleted session ${sessionId}`);
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.logger.log(`Deleted ${result.count} expired sessions`);
    return result.count;
  }
}
