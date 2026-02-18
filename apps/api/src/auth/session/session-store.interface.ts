import { Session } from '@prisma/client';

/**
 * SessionStore Interface
 * Abstraction for session persistence (Postgres, Redis, etc.)
 */
export interface SessionStore {
  /**
   * Create a new session
   * @param merchantId Owner of the session
   * @param ttlHours Time-to-live in hours
   * @param metadata Optional user agent and IP address
   */
  create(
    merchantId: string,
    ttlHours: number,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<Session>;

  /**
   * Find session by session ID
   * @param sessionId UUID session identifier
   */
  findBySessionId(sessionId: string): Promise<Session | null>;

  /**
   * Delete session by session ID
   * @param sessionId UUID session identifier
   */
  deleteBySessionId(sessionId: string): Promise<void>;

  /**
   * Delete all expired sessions
   * @returns Number of deleted sessions
   */
  deleteExpired(): Promise<number>;
}
