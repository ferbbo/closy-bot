import type { PrismaService } from '../../../../persistence/prisma/prisma.service';
import type { OutboxService } from '../../../../persistence/outbox/outbox.service';
import type { DeliveryConfig, DeliveryTurnContext } from '../../contracts';
import { NO_PHOTO_TEXT, PhotoTools } from './photo.tools';

describe('PhotoTools — ver_foto_producto (S5.4-T3, RN-00)', () => {
  const now = new Date('2026-11-27T20:00:00Z');
  const ctx = (over: Partial<DeliveryTurnContext> = {}): DeliveryTurnContext => ({
    merchantId: 'm1',
    customerId: 'c1',
    conversationId: 'conv1',
    customerPhone: '+573000000101',
    text: 'muéstrame la foto',
    config: { menuImageUrl: null } as unknown as DeliveryConfig,
    now,
    seenVariantIds: new Set(['v1']),
    ...over,
  });
  const setup = (imageUrl: string | null = 'https://cdn.example.com/doble.jpg') => {
    const prisma = {
      productVariant: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ product: { id: 'p1', name: 'Hamburguesa doble', imageUrl } }),
      },
      conversation: { findUnique: jest.fn().mockResolvedValue({ channelId: 'ch1' }) },
    };
    const outbox = { enqueueWhatsAppImage: jest.fn().mockResolvedValue({ id: 'o1' }) };
    const tools = new PhotoTools(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
    );
    return { tools, prisma, outbox, run: tools.handlers().ver_foto_producto };
  };

  it('sends Product.imageUrl read from the DB in the turn (scoped to the merchant)', async () => {
    const { run, prisma, outbox } = setup();
    const res = await run({ variantId: 'v1' }, ctx());
    expect(res).toEqual({ ok: true, data: { status: 'SENT', producto: 'Hamburguesa doble' } });
    expect(prisma.productVariant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1', product: { merchantId: 'm1', isActive: true } },
      }),
    );
    expect(outbox.enqueueWhatsAppImage).toHaveBeenCalledWith({
      merchantId: 'm1',
      conversationId: 'conv1',
      channelId: 'ch1',
      to: '+573000000101',
      link: 'https://cdn.example.com/doble.jpg',
      caption: 'Hamburguesa doble',
      dedupeKey: `photo:conv1:p1:${now.getTime()}`,
    });
  });

  it('null imageUrl → "no tengo foto de ese producto" and nothing is sent', async () => {
    const { run, outbox } = setup(null);
    const res = await run({ variantId: 'v1' }, ctx());
    expect(res).toEqual({ ok: true, data: { status: 'NO_PHOTO', respuesta: NO_PHOTO_TEXT } });
    expect(NO_PHOTO_TEXT.toLowerCase()).toContain('no tengo foto de ese producto');
    expect(outbox.enqueueWhatsAppImage).not.toHaveBeenCalled();
  });

  it('menu=true sends menuImageUrl from the turn config; null → NO_PHOTO', async () => {
    const { run, outbox } = setup();
    const withMenu = ctx({
      config: { menuImageUrl: 'https://cdn.example.com/carta.png' } as unknown as DeliveryConfig,
    });
    expect((await run({ menu: true }, withMenu)).data).toEqual({
      status: 'SENT',
      producto: 'carta',
    });
    expect(outbox.enqueueWhatsAppImage).toHaveBeenCalledWith(
      expect.objectContaining({ link: 'https://cdn.example.com/carta.png', caption: undefined }),
    );
    expect((await run({ menu: true }, ctx())).data).toMatchObject({ status: 'NO_PHOTO' });
  });

  it('rejects variantIds not seen in the turn, unknown variants and missing args (never throws)', async () => {
    const { run, prisma, outbox } = setup();
    expect(await run({ variantId: 'v9' }, ctx())).toEqual({ ok: false, error: 'UNKNOWN_VARIANT' });
    expect(await run({}, ctx())).toEqual({ ok: false, error: 'MISSING_VARIANT_OR_MENU' });
    prisma.productVariant.findFirst.mockResolvedValueOnce(null);
    expect(await run({ variantId: 'v1' }, ctx())).toEqual({ ok: false, error: 'UNKNOWN_VARIANT' });
    prisma.productVariant.findFirst.mockRejectedValueOnce(new Error('db down'));
    expect(await run({ variantId: 'v1' }, ctx())).toEqual({ ok: false, error: 'PHOTO_ERROR' });
    expect(outbox.enqueueWhatsAppImage).not.toHaveBeenCalled();
  });
});
