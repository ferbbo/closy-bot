import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { BurstBufferService, PendingBurst } from './burst-buffer.service';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { OutboxService } from '../../../persistence/outbox/outbox.service';
import { CustomerService } from '../../../services/customer.service';
import { ConversationService } from '../../../services/conversation.service';

const sql = (strings: TemplateStringsArray): string => strings.join('?');

describe('BurstBufferService (S5.1-T1)', () => {
  const ref = {
    from: '573001112233',
    receiverPhoneId: 'pnid-1',
    merchantId: 'm1',
    channelId: 'ch1',
  };
  let stored: PendingBurst | null;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    conversation: { findUnique: jest.Mock };
  };
  let orchestrator: { process: jest.Mock };
  let outbox: { enqueueWhatsAppText: jest.Mock };
  let debounce: unknown;
  let service: BurstBufferService;

  const build = () =>
    new BurstBufferService(
      prisma as unknown as PrismaService,
      { get: jest.fn(() => debounce) } as unknown as ConfigService,
      {
        resolveByPhone: jest.fn().mockResolvedValue({ id: 'cust1' }),
      } as unknown as CustomerService,
      {
        getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv1' }),
      } as unknown as ConversationService,
      outbox as unknown as OutboxService,
      { get: jest.fn(() => orchestrator) } as unknown as ModuleRef,
    );

  const enqueue = (messageId: string, text: string) =>
    service.enqueue({ ...ref, messageId, text, timestamp: new Date('2026-11-28T12:00:00Z') });

  beforeEach(() => {
    jest.useFakeTimers();
    stored = null;
    debounce = 4000;
    prisma = {
      // Simula el UPDATE atómico de jsonb: agrega el mensaje y re-arma dueAt
      $executeRaw: jest.fn((_s: TemplateStringsArray, ...values: unknown[]) => {
        const msgs = JSON.parse(values[0] as string) as PendingBurst['messages'];
        stored = {
          messages: [...(stored?.messages ?? []), ...msgs],
          dueAt: values[1] as string,
          merchantId: values[2] as string,
          channelId: values[3] as string,
          receiverPhoneId: values[4] as string,
        };
        return Promise.resolve(1);
      }),
      // Simula el compare-and-set: devuelve el buffer y lo borra (una sola vez)
      $queryRaw: jest.fn((s: TemplateStringsArray) => {
        if (sql(s).includes('WITH claimed')) {
          const burst = stored;
          stored = null;
          return Promise.resolve(burst ? [{ burst }] : []);
        }
        return Promise.resolve([{ id: 'conv1' }]);
      }),
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ customer: { phone: ref.from } }),
      },
    };
    orchestrator = {
      process: jest.fn().mockResolvedValue({
        response: 'listo',
        shouldSend: true,
        conversationId: 'conv1',
        merchantId: 'm1',
        intent: 'DELIVERY_ORDER',
      }),
    };
    outbox = { enqueueWhatsAppText: jest.fn().mockResolvedValue({}) };
    service = build();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('windowMs', () => {
    it('defaults to 4000 and parses strings', () => {
      debounce = undefined;
      expect(service.windowMs).toBe(4000);
      debounce = '300';
      expect(service.windowMs).toBe(300);
      expect(service.isEnabled()).toBe(true);
    });

    it('is disabled with 0', () => {
      debounce = '0';
      expect(service.windowMs).toBe(0);
      expect(service.isEnabled()).toBe(false);
    });
  });

  it('three messages inside the window → one orchestrator turn with the joined text', async () => {
    await enqueue('wamid.1', 'hola');
    jest.advanceTimersByTime(1000);
    await enqueue('wamid.2', 'quiero 2 hamburguesas');
    jest.advanceTimersByTime(1000);
    await enqueue('wamid.3', 'y una gaseosa');
    expect(orchestrator.process).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(4000);

    expect(orchestrator.process).toHaveBeenCalledTimes(1);
    expect(orchestrator.process).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'wamid.3',
        from: ref.from,
        merchantId: 'm1',
        channelId: 'ch1',
        receiverPhoneId: 'pnid-1',
        text: 'hola\nquiero 2 hamburguesas\ny una gaseosa',
      }),
    );
    expect(outbox.enqueueWhatsAppText).toHaveBeenCalledWith(
      expect.objectContaining({ to: ref.from, text: 'listo', dedupeKey: 'reply:wamid.3' }),
    );
    expect(stored).toBeNull();
  });

  it('re-arms the window with each new message', async () => {
    await enqueue('wamid.1', 'a');
    await jest.advanceTimersByTimeAsync(3500);
    await enqueue('wamid.2', 'b');
    await jest.advanceTimersByTimeAsync(3500);
    expect(orchestrator.process).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(600);
    expect(orchestrator.process).toHaveBeenCalledTimes(1);
  });

  it('does not process twice when timer and a second flush race (compare-and-set)', async () => {
    await enqueue('wamid.1', 'a');
    const results = await Promise.all([service.flush('conv1'), service.flush('conv1')]);
    await jest.advanceTimersByTimeAsync(5000);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(orchestrator.process).toHaveBeenCalledTimes(1);
  });

  it('flushPending processes what is pending before a media turn', async () => {
    await enqueue('wamid.1', 'una perro');
    await service.flushPending(ref);
    expect(orchestrator.process).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0]).toContain(true); // force
    await jest.advanceTimersByTimeAsync(5000);
    expect(orchestrator.process).toHaveBeenCalledTimes(1);
  });

  it('flushPending with nothing pending is a no-op', async () => {
    await service.flushPending(ref);
    expect(orchestrator.process).not.toHaveBeenCalled();
  });

  it('does not enqueue a reply when shouldSend=false and never throws on orchestrator errors', async () => {
    orchestrator.process.mockResolvedValueOnce({ shouldSend: false, intent: 'HANDOFF' });
    await enqueue('wamid.1', 'a');
    await expect(service.flush('conv1', true)).resolves.toBe(true);
    expect(outbox.enqueueWhatsAppText).not.toHaveBeenCalled();

    orchestrator.process.mockRejectedValueOnce(new Error('boom'));
    await enqueue('wamid.2', 'b');
    await expect(service.flush('conv1', true)).resolves.toBe(false);
  });

  it('findDue returns ids of conversations whose window expired', async () => {
    await expect(service.findDue(new Date())).resolves.toEqual(['conv1']);
  });
});
