import type { OutboxService } from '../../../persistence/outbox/outbox.service';
import { isAffirmative } from '../agent/tools/confirm.tools';
import {
  DELIVERY_CONFIRM_BUTTONS,
  DELIVERY_CONFIRM_QUESTION,
  InteractiveConfirmationSender,
} from './interactive-confirmation';

describe('InteractiveConfirmationSender (S5.4-T2)', () => {
  const block = '─────────────\n1× Hamburguesa sencilla ..... $16.000\nTotal ..... $20.000';
  const base = {
    merchantId: 'm1',
    conversationId: 'conv1',
    channelId: 'ch1',
    to: '+573000000101',
    inboundMessageId: 'wamid.9',
    prefix: '',
    summaryBlock: block,
  };
  const setup = () => {
    const outbox = { enqueueWhatsAppInteractive: jest.fn().mockResolvedValue({ id: 'o1' }) };
    return {
      outbox,
      sender: new InteractiveConfirmationSender(outbox as unknown as OutboxService),
    };
  };

  it('button titles are ≤ 20 chars, ids are stable and map to the affirmative/negative classifier', () => {
    expect(DELIVERY_CONFIRM_BUTTONS.map((b) => b.id)).toEqual([
      'delivery_confirm_yes',
      'delivery_confirm_no',
    ]);
    for (const b of DELIVERY_CONFIRM_BUTTONS) expect(b.title.length).toBeLessThanOrEqual(20);
    expect(isAffirmative(DELIVERY_CONFIRM_BUTTONS[0].title)).toBe(true);
    expect(isAffirmative(DELIVERY_CONFIRM_BUTTONS[1].title)).toBe(false);
  });

  it('enqueues the exact presenter block + fixed question with Sí/No buttons and reply dedupeKey', async () => {
    const { sender, outbox } = setup();
    const body = await sender.send({ ...base, prefix: 'Escuché: "dale"\n' });
    expect(body).toBe(`Escuché: "dale"\n${block}\n\n${DELIVERY_CONFIRM_QUESTION}`);
    expect(outbox.enqueueWhatsAppInteractive).toHaveBeenCalledWith({
      merchantId: 'm1',
      conversationId: 'conv1',
      channelId: 'ch1',
      to: '+573000000101',
      body,
      buttons: [
        { id: 'delivery_confirm_yes', title: 'Sí, confirmo' },
        { id: 'delivery_confirm_no', title: 'No, cambiar algo' },
      ],
      dedupeKey: 'reply:wamid.9',
    });
  });

  it('falls back (null) without channel, with a body over 1024 chars or when enqueue fails', async () => {
    const { sender, outbox } = setup();
    expect(await sender.send({ ...base, channelId: null })).toBeNull();
    expect(await sender.send({ ...base, summaryBlock: 'x'.repeat(1100) })).toBeNull();
    expect(outbox.enqueueWhatsAppInteractive).not.toHaveBeenCalled();
    outbox.enqueueWhatsAppInteractive.mockRejectedValueOnce(new Error('db down'));
    expect(await sender.send(base)).toBeNull();
  });
});
