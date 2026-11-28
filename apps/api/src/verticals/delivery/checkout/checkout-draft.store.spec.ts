import type { PrismaService } from '../../../persistence/prisma/prisma.service';
import { CheckoutDraftStore } from './checkout-draft.store';

function prismaWith(metadata: unknown) {
  const conversation = {
    findUnique: jest.fn().mockResolvedValue(metadata === undefined ? null : { metadata }),
    update: jest.fn().mockResolvedValue({}),
  };
  return { conversation, prisma: { conversation } as unknown as PrismaService };
}

describe('CheckoutDraftStore (S3.1-T1)', () => {
  it('get: devuelve metadata.delivery.checkout', async () => {
    const { prisma } = prismaWith({
      delivery: { checkout: { cartId: 'cart-1', neighborhood: 'Cabecera' } },
    });
    await expect(new CheckoutDraftStore(prisma).get('conv-1')).resolves.toEqual({
      cartId: 'cart-1',
      neighborhood: 'Cabecera',
    });
  });

  it.each([[undefined], [null], [{}], [{ delivery: {} }], [{ delivery: { checkout: 'x' } }]])(
    'get: sin draft válido → null (%j)',
    async (metadata) => {
      const { prisma } = prismaWith(metadata);
      await expect(new CheckoutDraftStore(prisma).get('conv-1')).resolves.toBeNull();
    },
  );

  it('patch: mezcla sin pisar el resto de metadata ni de metadata.delivery', async () => {
    const { prisma, conversation } = prismaWith({
      expecting: { flow: 'x' },
      delivery: {
        privacyNoticeAt: '2026-11-27T00:00:00.000Z',
        lastCandidates: { items: [], createdAt: 'y' },
        checkout: { cartId: 'cart-1', address: 'Cra 27 #45-12', fulfillment: 'delivery' },
      },
    });
    const draft = await new CheckoutDraftStore(prisma).patch('conv-1', {
      neighborhood: 'Cabecera',
    });
    expect(draft).toEqual({
      cartId: 'cart-1',
      address: 'Cra 27 #45-12',
      fulfillment: 'delivery',
      neighborhood: 'Cabecera',
    });
    expect(conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: {
        metadata: {
          expecting: { flow: 'x' },
          delivery: {
            privacyNoticeAt: '2026-11-27T00:00:00.000Z',
            lastCandidates: { items: [], createdAt: 'y' },
            checkout: draft,
          },
        },
      },
    });
  });

  it('patch: una clave en undefined se borra (invalida la cotización)', async () => {
    const quote = {
      ok: true as const,
      zoneId: 'cabecera',
      zoneName: 'Cabecera',
      fee: 4000,
      etaMinutes: 45,
      fulfillment: 'delivery' as const,
    };
    const { prisma } = prismaWith({
      delivery: { checkout: { cartId: 'cart-1', neighborhood: 'Cabecera', quote } },
    });
    const draft = await new CheckoutDraftStore(prisma).patch('conv-1', {
      neighborhood: 'Provenza',
      quote: undefined,
    });
    expect(draft).toEqual({ cartId: 'cart-1', neighborhood: 'Provenza' });
    expect('quote' in draft).toBe(false);
  });

  it('patch: sin metadata previa crea delivery.checkout', async () => {
    const { prisma, conversation } = prismaWith(null);
    await new CheckoutDraftStore(prisma).patch('conv-1', { cartId: 'cart-9' });
    expect(conversation.update.mock.calls[0][0].data.metadata).toEqual({
      delivery: { checkout: { cartId: 'cart-9' } },
    });
  });
});
