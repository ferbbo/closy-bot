/**
 * handoff.flow.spec.ts
 * PR-08: Unit tests for HandoffFlow
 * REQ-09, AC-11
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HandoffFlow } from './handoff.flow';
import { HandoffService } from '../../services/handoff.service';
import { PlaybookService } from '../../services/playbook.service';

const mockMerchantPlaybook = {
  id: 'merchant-1',
  name: 'Test Store',
  industry: 'ropa' as const,
  playbookConfig: null,
};

describe('HandoffFlow', () => {
  let flow: HandoffFlow;
  let handoffService: jest.Mocked<HandoffService>;
  let playbookService: jest.Mocked<PlaybookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffFlow,
        {
          provide: HandoffService,
          useValue: {
            createHandoff: jest.fn().mockResolvedValue({
              id: 'handoff-1',
              status: 'pending',
            }),
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getPlaybookForMerchant: jest.fn().mockReturnValue({
              industry: 'ropa',
              handoffMessages: {
                requestReceived:
                  '¡Entendido! 👗 Te conecto con nuestro equipo de {merchant_name}. Un momento...',
                escalationDetected:
                  'Veo que necesitas ayuda específica 👗 Te conecto con nuestro equipo. Un momento...',
                merchantNotification:
                  '🔔 *Atención requerida*\n\n👤 Cliente: {customerName}\n\n{summary}',
              },
              messages: {},
              llmPrompt: {},
              checkoutQuestions: [],
              rules: {},
            }),
          },
        },
      ],
    }).compile();

    flow = module.get<HandoffFlow>(HandoffFlow);
    handoffService = module.get(HandoffService);
    playbookService = module.get(PlaybookService);
  });

  it('should be defined', () => {
    expect(flow).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-11: handle() — explicit user_request
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-11: handle() with reason user_request', () => {
    it('calls handoffService.createHandoff with reason=user_request', async () => {
      await flow.handle(mockMerchantPlaybook, 'conv-1', 'customer-1', 'merchant-1', 'user_request');

      expect(handoffService.createHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          customerId: 'customer-1',
          merchantId: 'merchant-1',
        }),
        'user_request',
      );
    });

    it('returns requestReceived message from playbook (with merchant name interpolated)', async () => {
      const response = await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'user_request',
      );

      expect(response).toContain('Test Store');
      expect(response).not.toContain('{merchant_name}');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-11: handle() — auto_escalation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-11: handle() with reason auto_escalation', () => {
    it('calls handoffService.createHandoff with reason=auto_escalation', async () => {
      await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'auto_escalation',
      );

      expect(handoffService.createHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1' }),
        'auto_escalation',
      );
    });

    it('returns escalationDetected message from playbook', async () => {
      const response = await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'auto_escalation',
      );

      expect(response).toContain('ayuda específica');
    });

    it('returns different message than user_request', async () => {
      const userRequestResponse = await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'user_request',
      );
      const escalationResponse = await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'auto_escalation',
      );

      expect(userRequestResponse).not.toBe(escalationResponse);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-11: fallback when handoffMessages not defined
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-11: fallback when handoffMessages not configured', () => {
    beforeEach(() => {
      (playbookService.getPlaybookForMerchant as jest.Mock).mockReturnValue({
        industry: 'ropa',
        handoffMessages: undefined, // no custom messages
      });
    });

    it('uses default requestReceived fallback message', async () => {
      const response = await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'user_request',
      );
      expect(response).toContain('equipo');
    });

    it('uses default escalationDetected fallback message', async () => {
      const response = await flow.handle(
        mockMerchantPlaybook,
        'conv-1',
        'customer-1',
        'merchant-1',
        'auto_escalation',
      );
      expect(response).toContain('equipo');
    });
  });
});
