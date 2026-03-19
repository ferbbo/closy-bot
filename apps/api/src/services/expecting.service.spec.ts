/**
 * PR-04.0 — ExpectingService unit tests
 * AC-02: set/get/clear/TTL
 * AC-03: idempotency + clear → null
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Test, TestingModule } from '@nestjs/testing';
import { ExpectingService } from './expecting.service';
import { ConversationRepository } from '../persistence/repositories/conversation.repository';
import type { ExpectingState } from '../orchestrator/types/expecting.types';

const makeState = (overrides?: Partial<ExpectingState>): ExpectingState => ({
  flow: 'search_selection',
  type: 'select_product',
  data: { products: [{ id: 'p1', name: 'Producto', price: 10000, stock: 5 }] },
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // +10 min
  ...overrides,
});

describe('AC-02: ExpectingService - set/get/clear/TTL', () => {
  let service: ExpectingService;
  let conversationRepository: jest.Mocked<ConversationRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpectingService,
        {
          provide: ConversationRepository,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExpectingService>(ExpectingService);
    conversationRepository = module.get(ConversationRepository);
  });

  describe('setExpecting', () => {
    it('AC-02: should persist state in metadata.expecting', async () => {
      const state = makeState();
      conversationRepository.findById.mockResolvedValue({ id: 'conv-1', metadata: null } as any);
      conversationRepository.update.mockResolvedValue({} as any);

      await service.setExpecting('conv-1', state);

      expect(conversationRepository.update).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          metadata: expect.objectContaining({ expecting: state }),
        }),
      );
    });

    it('AC-02: should merge with existing metadata (not overwrite other keys)', async () => {
      const existingMeta = { someOtherKey: 'value' };
      const state = makeState();
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: existingMeta,
      } as any);
      conversationRepository.update.mockResolvedValue({} as any);

      await service.setExpecting('conv-1', state);

      const updateCall = conversationRepository.update.mock.calls[0][1];
      const meta = updateCall.metadata as any;
      expect(meta.someOtherKey).toBe('value');
      expect(meta.expecting).toEqual(state);
    });

    it('AC-02: should do nothing if conversation does not exist', async () => {
      conversationRepository.findById.mockResolvedValue(null);

      await expect(service.setExpecting('nonexistent', makeState())).resolves.not.toThrow();
      expect(conversationRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getExpecting', () => {
    it('AC-02: should return state when valid (not expired)', async () => {
      const state = makeState();
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: state },
      } as any);

      const result = await service.getExpecting('conv-1');
      expect(result).toEqual(state);
    });

    it('AC-02: should return null when TTL expired', async () => {
      const expiredState = makeState({
        expiresAt: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
      });
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: expiredState },
      } as any);

      const result = await service.getExpecting('conv-1');
      expect(result).toBeNull();
    });

    it('AC-02: should return null if no expecting key in metadata', async () => {
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { someOtherKey: 'value' },
      } as any);

      const result = await service.getExpecting('conv-1');
      expect(result).toBeNull();
    });

    it('AC-02: should return null if metadata is null', async () => {
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: null,
      } as any);

      const result = await service.getExpecting('conv-1');
      expect(result).toBeNull();
    });

    it('AC-02: should return null if conversation not found', async () => {
      conversationRepository.findById.mockResolvedValue(null);

      const result = await service.getExpecting('nonexistent');
      expect(result).toBeNull();
    });

    it('AC-02: checkout flow TTL is 30 min (future timestamp returns state)', async () => {
      const checkoutState = makeState({
        flow: 'checkout',
        type: 'input_name',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // +30 min
      });
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: checkoutState },
      } as any);

      const result = await service.getExpecting('conv-1');
      expect(result).toEqual(checkoutState);
    });
  });

  describe('clearExpecting', () => {
    it('AC-02: should remove expecting key from metadata', async () => {
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: makeState(), anotherKey: 'kept' },
      } as any);
      conversationRepository.update.mockResolvedValue({} as any);

      await service.clearExpecting('conv-1');

      const updateCall = conversationRepository.update.mock.calls[0][1];
      const meta = updateCall.metadata as any;
      expect(meta.expecting).toBeUndefined();
      expect(meta.anotherKey).toBe('kept');
    });

    it('AC-02: should not throw if conversation does not exist', async () => {
      conversationRepository.findById.mockResolvedValue(null);

      await expect(service.clearExpecting('nonexistent')).resolves.not.toThrow();
      expect(conversationRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('isExpecting', () => {
    it('AC-02: should return true when active state matches flow and type', async () => {
      const state = makeState({ flow: 'search_selection', type: 'select_product' });
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: state },
      } as any);

      const result = await service.isExpecting('conv-1', 'search_selection', 'select_product');
      expect(result).toBe(true);
    });

    it('AC-02: should return false if flow does not match', async () => {
      const state = makeState({ flow: 'search_selection' });
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: state },
      } as any);

      const result = await service.isExpecting('conv-1', 'checkout');
      expect(result).toBe(false);
    });

    it('AC-02: should return false if type does not match', async () => {
      const state = makeState({ flow: 'search_selection', type: 'select_product' });
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: state },
      } as any);

      const result = await service.isExpecting('conv-1', 'search_selection', 'product_options');
      expect(result).toBe(false);
    });

    it('AC-02: should return false if TTL expired', async () => {
      const state = makeState({ expiresAt: new Date(Date.now() - 1000).toISOString() });
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { expecting: state },
      } as any);

      const result = await service.isExpecting('conv-1');
      expect(result).toBe(false);
    });
  });
});

describe('AC-03: ExpectingService - idempotency and clear', () => {
  let service: ExpectingService;
  let conversationRepository: jest.Mocked<ConversationRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpectingService,
        {
          provide: ConversationRepository,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExpectingService>(ExpectingService);
    conversationRepository = module.get(ConversationRepository);
  });

  it('AC-03: calling setExpecting twice overwrites with latest state', async () => {
    const state1 = makeState({ type: 'select_product' });
    const state2 = makeState({ type: 'product_options' });

    conversationRepository.findById.mockResolvedValue({ id: 'conv-1', metadata: null } as any);
    conversationRepository.update.mockResolvedValue({} as any);

    await service.setExpecting('conv-1', state1);
    await service.setExpecting('conv-1', state2);

    const lastCall = conversationRepository.update.mock.calls[1][1];
    const meta = lastCall.metadata as any;
    expect(meta.expecting.type).toBe('product_options');
  });

  it('AC-03: clearExpecting then getExpecting returns null', async () => {
    const state = makeState();

    // First call: findById for clearExpecting
    conversationRepository.findById
      .mockResolvedValueOnce({ id: 'conv-1', metadata: { expecting: state } } as any) // clearExpecting
      .mockResolvedValueOnce({ id: 'conv-1', metadata: {} } as any); // getExpecting after clear

    conversationRepository.update.mockResolvedValue({} as any);

    await service.clearExpecting('conv-1');
    const result = await service.getExpecting('conv-1');

    expect(result).toBeNull();
  });

  it('AC-03: static cartSearchExpiresAt returns future timestamp within 11 min', () => {
    const before = Date.now();
    const iso = ExpectingService.cartSearchExpiresAt();
    const after = Date.now();
    const ts = new Date(iso).getTime();
    expect(ts).toBeGreaterThan(before + 9 * 60 * 1000);
    expect(ts).toBeLessThan(after + 11 * 60 * 1000);
  });

  it('AC-03: static checkoutExpiresAt returns future timestamp within 31 min', () => {
    const before = Date.now();
    const iso = ExpectingService.checkoutExpiresAt();
    const after = Date.now();
    const ts = new Date(iso).getTime();
    expect(ts).toBeGreaterThan(before + 29 * 60 * 1000);
    expect(ts).toBeLessThan(after + 31 * 60 * 1000);
  });
});
