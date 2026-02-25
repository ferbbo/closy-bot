/**
 * HandoffFlow
 * PR-08: REQ-09, AC-11
 *
 * Handles intent HANDOFF (explicit user request) and auto-escalation.
 * Template-first: uses playbook handoffMessages for replies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { HandoffService, HandoffContext } from '../../services/handoff.service';
import { PlaybookService } from '../../services/playbook.service';
import type { MerchantPlaybookData } from '../../services/playbook.service';

@Injectable()
export class HandoffFlow {
  private readonly logger = new Logger(HandoffFlow.name);

  constructor(
    private readonly handoffService: HandoffService,
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * AC-11: Handle handoff — explicit user request or auto-escalation
   *
   * @param merchant - Merchant data for playbook resolution
   * @param conversationId - Active conversation ID
   * @param customerId - Customer ID
   * @param merchantId - Merchant ID
   * @param reason - "user_request" | "auto_escalation"
   * @returns Response message to send to customer
   */
  async handle(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    reason: 'user_request' | 'auto_escalation',
  ): Promise<string> {
    const ctx: HandoffContext = {
      conversationId,
      customerId,
      merchantId,
      merchant,
    };

    // Create handoff (idempotent)
    await this.handoffService.createHandoff(ctx, reason);

    // Resolve playbook message based on reason (AC-11)
    const playbook = this.playbookService.getPlaybookForMerchant(merchant);
    const handoffMessages = playbook.handoffMessages;

    if (reason === 'user_request') {
      const template =
        handoffMessages?.requestReceived ?? DEFAULT_REQUEST_RECEIVED;
      return template.replace('{merchant_name}', merchant.name);
    } else {
      const template =
        handoffMessages?.escalationDetected ?? DEFAULT_ESCALATION_DETECTED;
      return template.replace('{merchant_name}', merchant.name);
    }
  }
}

const DEFAULT_REQUEST_RECEIVED =
  'Entendido. Te conecto con una persona de nuestro equipo. Un momento por favor...';

const DEFAULT_ESCALATION_DETECTED =
  'Veo que necesitas ayuda específica. Te conecto con nuestro equipo. Un momento...';
