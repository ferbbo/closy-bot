/**
 * handoff.service.spec.ts
 * PR-08: Unit tests for HandoffService
 * REQ-02, REQ-04, REQ-05, REQ-06, REQ-08
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HandoffStatus } from '@prisma/client';
import { HandoffService } from './handoff.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { LlmService } from '../llm/llm.service';
import { PlaybookService } from './playbook.service';

const mockConversation = {
  id: 'conv-1',
  lastIntent: 'SEARCH_PRODUCT',
  metadata: {},
  customer: { name: 'Ana', phone: '+573001234567' },
};

const mockCart = {
  id: 'cart-1',
  status: 'active',
  items: [
    {
      quantity: 2,
      priceSnapshot: { toNumber: () => 50000 },
      variant: { product: { name: 'Camiseta Básica' } },
    },
  ],
};

const mockMerchant = {
  id: 'merchant-1',
  name: 'Test Store',
  whatsappNumber: '+573009999999',
  industry: null,
  playbookConfig: null,
};

const mockHandoffCtx = {
  conversationId: 'conv-1',
  customerId: 'customer-1',
  merchantId: 'merchant-1',
  merchant: {
    id: 'merchant-1',
    name: 'Test Store',
    industry: null,
    playbookConfig: null,
  },
};

describe('HandoffService', () => {
  let service: HandoffService;
  let prisma: jest.Mocked<PrismaService>;
  let outboxRepository: jest.Mocked<OutboxRepository>;
  let llmService: jest.Mocked<LlmService>;
  let playbookService: jest.Mocked<PlaybookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              if (key === 'LLM_SUMMARY_ENABLED') return false;
              return def;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            handoff: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            conversation: {
              findUnique: jest.fn().mockResolvedValue(mockConversation),
              update: jest.fn().mockResolvedValue({ id: 'conv-1', handoffActive: true }),
            },
            cart: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            messageLog: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            merchant: {
              findUnique: jest.fn().mockResolvedValue(mockMerchant),
            },
          },
        },
        {
          provide: OutboxRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
          },
        },
        {
          provide: LlmService,
          useValue: {
            generateSimple: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getPlaybookForMerchant: jest.fn().mockReturnValue({
              industry: 'ropa',
              handoffMessages: {
                requestReceived: 'Entendido. Te conecto con {merchant_name}.',
                escalationDetected: 'Te conecto con nuestro equipo.',
                merchantNotification: '🔔 Atención: {customerName}\n{summary}',
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

    service = module.get<HandoffService>(HandoffService);
    prisma = module.get(PrismaService);
    outboxRepository = module.get(OutboxRepository);
    llmService = module.get(LlmService);
    playbookService = module.get(PlaybookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-02: detectHandoff — keyword match
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-02: detectHandoff — keyword match', () => {
    it('returns true when intent === HANDOFF', () => {
      expect(service.detectHandoff('HANDOFF', 0)).toBe(true);
    });

    it('returns false when intent !== HANDOFF and unknownLoopCount < 3', () => {
      expect(service.detectHandoff('GREETING', 2)).toBe(false);
    });

    it('returns false when intent !== HANDOFF and unknownLoopCount === 0', () => {
      expect(service.detectHandoff('SEARCH_PRODUCT', 0)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-03: detectHandoff — auto-escalation threshold
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-03: detectHandoff — auto-escalation', () => {
    it('returns true when unknownLoopCount >= 3', () => {
      expect(service.detectHandoff('UNKNOWN', 3)).toBe(true);
    });

    it('returns true when unknownLoopCount > 3', () => {
      expect(service.detectHandoff('UNKNOWN', 5)).toBe(true);
    });

    it('returns false when unknownLoopCount === 2', () => {
      expect(service.detectHandoff('UNKNOWN', 2)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-04: createHandoff — creates record + activates handoffActive + notifies
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-04: createHandoff', () => {
    beforeEach(() => {
      (prisma.handoff.findFirst as jest.Mock).mockResolvedValue(null); // no existing
      (prisma.handoff.create as jest.Mock).mockResolvedValue({
        id: 'handoff-1',
        conversationId: 'conv-1',
        reason: 'user_request',
        summaryJson: {},
        status: HandoffStatus.pending,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('creates handoff record in DB', async () => {
      await service.createHandoff(mockHandoffCtx, 'user_request');
      expect(prisma.handoff.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-1',
            reason: 'user_request',
            status: HandoffStatus.pending,
          }),
        }),
      );
    });

    it('AC-10: sets handoffActive=true on conversation', async () => {
      await service.createHandoff(mockHandoffCtx, 'user_request');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { handoffActive: true },
      });
    });

    it('AC-09: enqueues outbox notification to merchant', async () => {
      await service.createHandoff(mockHandoffCtx, 'user_request');
      expect(outboxRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-14: createHandoff — idempotency
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-14: createHandoff idempotency', () => {
    it('returns existing handoff if pending/active exists, does not create new', async () => {
      const existingHandoff = {
        id: 'existing-handoff',
        conversationId: 'conv-1',
        reason: 'user_request',
        status: HandoffStatus.pending,
        summaryJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.handoff.findFirst as jest.Mock).mockResolvedValue(existingHandoff);

      const result = await service.createHandoff(mockHandoffCtx, 'user_request');

      expect(result.id).toBe('existing-handoff');
      expect(prisma.handoff.create).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(outboxRepository.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-07: generateSummary — deterministic from DB
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-07: generateSummary — deterministic', () => {
    it('builds summary with intent, cartSnapshot, customerInfo, highlights', async () => {
      const summary = await service.generateSummary(mockHandoffCtx);

      expect(summary.intent).toBe('SEARCH_PRODUCT');
      expect(summary.customerInfo.name).toBe('Ana');
      expect(summary.customerInfo.phone).toBe('+573001234567');
      expect(summary.cartSnapshot).toEqual([]);
      expect(typeof summary.conversationHighlights).toBe('string');
    });

    it('includes cart items when active cart exists', async () => {
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(mockCart);

      const summary = await service.generateSummary(mockHandoffCtx);

      expect(summary.cartSnapshot).toHaveLength(1);
      expect(summary.cartSnapshot[0].productName).toBe('Camiseta Básica');
      expect(summary.cartSnapshot[0].qty).toBe(2);
    });

    it('uses last 3 messages for deterministic highlights', async () => {
      (prisma.messageLog.findMany as jest.Mock).mockResolvedValue([
        { direction: 'IN', text: 'Hola', createdAt: new Date() },
        { direction: 'OUT', text: 'Hola! ¿En qué te ayudo?', createdAt: new Date() },
        { direction: 'IN', text: 'Quiero ver tallas', createdAt: new Date() },
      ]);

      const summary = await service.generateSummary(mockHandoffCtx);

      expect(summary.conversationHighlights).toContain('[IN]');
      expect(summary.conversationHighlights).toContain('[OUT]');
    });

    it("sets intent='UNKNOWN' when conversation has no lastIntent", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        ...mockConversation,
        lastIntent: null,
      });

      const summary = await service.generateSummary(mockHandoffCtx);
      expect(summary.intent).toBe('UNKNOWN');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-08: generateSummary — LLM-assisted opt-in
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-08: generateSummary — LLM-assisted (opt-in)', () => {
    beforeEach(async () => {
      // Create service with LLM enabled
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandoffService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                if (key === 'LLM_SUMMARY_ENABLED') return true;
                return def;
              }),
            },
          },
          {
            provide: PrismaService,
            useValue: {
              conversation: {
                findUnique: jest.fn().mockResolvedValue(mockConversation),
                update: jest.fn(),
              },
              cart: { findFirst: jest.fn().mockResolvedValue(null) },
              messageLog: { findMany: jest.fn().mockResolvedValue([]) },
              merchant: { findUnique: jest.fn().mockResolvedValue(mockMerchant) },
              handoff: { findFirst: jest.fn(), create: jest.fn() },
            },
          },
          { provide: OutboxRepository, useValue: { create: jest.fn() } },
          {
            provide: LlmService,
            useValue: {
              generateSimple: jest.fn().mockResolvedValue('Cliente busca ropa de talla M'),
            },
          },
          {
            provide: PlaybookService,
            useValue: {
              getPlaybookForMerchant: jest.fn().mockReturnValue({ handoffMessages: null }),
            },
          },
        ],
      }).compile();

      service = module.get<HandoffService>(HandoffService);
      llmService = module.get(LlmService);
    });

    it('calls LlmService.generateSimple when LLM_SUMMARY_ENABLED=true', async () => {
      await service.generateSummary(mockHandoffCtx);
      expect(llmService.generateSimple).toHaveBeenCalledTimes(1);
    });

    it('uses LLM result as conversationHighlights', async () => {
      const summary = await service.generateSummary(mockHandoffCtx);
      expect(summary.conversationHighlights).toBe('Cliente busca ropa de talla M');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-15: LLM fallback on error
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AC-15: LLM summary fallback on error', () => {
    it('falls back to deterministic highlights if LLM throws', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandoffService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                if (key === 'LLM_SUMMARY_ENABLED') return true;
                return def;
              }),
            },
          },
          {
            provide: PrismaService,
            useValue: {
              conversation: { findUnique: jest.fn().mockResolvedValue(mockConversation), update: jest.fn() },
              cart: { findFirst: jest.fn().mockResolvedValue(null) },
              messageLog: {
                findMany: jest.fn().mockResolvedValue([
                  { direction: 'IN', text: 'Hola', createdAt: new Date() },
                ]),
              },
              merchant: { findUnique: jest.fn().mockResolvedValue(mockMerchant) },
              handoff: { findFirst: jest.fn(), create: jest.fn() },
            },
          },
          { provide: OutboxRepository, useValue: { create: jest.fn() } },
          {
            provide: LlmService,
            useValue: {
              generateSimple: jest.fn().mockRejectedValue(new Error('LLM timeout')),
            },
          },
          {
            provide: PlaybookService,
            useValue: {
              getPlaybookForMerchant: jest.fn().mockReturnValue({ handoffMessages: null }),
            },
          },
        ],
      }).compile();
      service = module.get<HandoffService>(HandoffService);

      const summary = await service.generateSummary(mockHandoffCtx);
      // Should not throw, and highlights should contain deterministic message history
      expect(summary.conversationHighlights).toContain('[IN]');
    });
  });
});
