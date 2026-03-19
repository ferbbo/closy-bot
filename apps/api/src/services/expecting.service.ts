/**
 * PR-04.0 — ExpectingService
 * REQ-02, REQ-03, REQ-04: Unified persisted state for multi-step conversational flows.
 *
 * State is stored in Conversation.metadata.expecting (single key, replaces metadata.checkout).
 * TTL rules (hardcoded V1):
 *   - cart/search flows: 10 minutes
 *   - checkout flow: 30 minutes
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConversationRepository } from '../persistence/repositories/conversation.repository';
import type { ExpectingState } from '../orchestrator/types/expecting.types';

/** TTL constants (milliseconds) */
const TTL_CART_SEARCH_MS = 10 * 60 * 1000; // 10 minutes
const TTL_CHECKOUT_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class ExpectingService {
  private readonly logger = new Logger(ExpectingService.name);

  constructor(private readonly conversationRepository: ConversationRepository) {}

  // ---------------------------------------------------------------------------
  // REQ-02: setExpecting — persist expecting state (read-merge-write)
  // Idempotent: calling twice overwrites with latest state + refreshed TTL.
  // ---------------------------------------------------------------------------
  async setExpecting(conversationId: string, state: ExpectingState): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      this.logger.warn(`setExpecting: conversation ${conversationId} not found`);
      return;
    }

    const existingMeta = (conversation.metadata as Record<string, unknown> | null) ?? {};
    const updatedMeta: Record<string, unknown> = { ...existingMeta, expecting: state };

    await this.conversationRepository.update(conversationId, {
      metadata: updatedMeta as unknown as Prisma.InputJsonValue,
    });

    this.logger.debug(
      `setExpecting: conv=${conversationId} flow=${state.flow} type=${state.type} expiresAt=${state.expiresAt}`,
    );
  }

  // ---------------------------------------------------------------------------
  // REQ-03: getExpecting — returns null if TTL expired or not set
  // ---------------------------------------------------------------------------
  async getExpecting(conversationId: string): Promise<ExpectingState | null> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) return null;

    const meta = conversation.metadata as Record<string, unknown> | null;
    if (!meta?.expecting) return null;

    const state = meta.expecting as ExpectingState;

    // TTL check
    if (new Date(state.expiresAt) <= new Date()) {
      this.logger.debug(
        `getExpecting: state expired for conv=${conversationId} (expiresAt=${state.expiresAt})`,
      );
      return null;
    }

    return state;
  }

  // ---------------------------------------------------------------------------
  // REQ-04: clearExpecting — removes the expecting key from metadata
  // ---------------------------------------------------------------------------
  async clearExpecting(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) return;

    const meta = (conversation.metadata as Record<string, unknown> | null) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { expecting: _removed, ...rest } = meta;

    await this.conversationRepository.update(conversationId, {
      metadata: rest as unknown as Prisma.InputJsonValue,
    });

    this.logger.debug(`clearExpecting: conv=${conversationId}`);
  }

  // ---------------------------------------------------------------------------
  // REQ-04: isExpecting — quick check (optional flow/type filter)
  // ---------------------------------------------------------------------------
  async isExpecting(conversationId: string, flow?: string, type?: string): Promise<boolean> {
    const state = await this.getExpecting(conversationId);
    if (!state) return false;

    if (flow && state.flow !== flow) return false;
    if (type && state.type !== type) return false;

    return true;
  }

  // ---------------------------------------------------------------------------
  // Static helpers for building expiresAt timestamps
  // ---------------------------------------------------------------------------

  /** Returns ISO timestamp 10 minutes from now (cart + search flows) */
  static cartSearchExpiresAt(): string {
    return new Date(Date.now() + TTL_CART_SEARCH_MS).toISOString();
  }

  /** Returns ISO timestamp 30 minutes from now (checkout flow) */
  static checkoutExpiresAt(): string {
    return new Date(Date.now() + TTL_CHECKOUT_MS).toISOString();
  }
}
