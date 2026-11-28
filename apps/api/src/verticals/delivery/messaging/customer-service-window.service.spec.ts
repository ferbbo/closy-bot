import { MessageDirection } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import {
  CUSTOMER_SERVICE_WINDOW_MS,
  CustomerServiceWindowService,
  phoneVariants,
} from './customer-service-window.service';

describe('CustomerServiceWindowService (S1.4-T3)', () => {
  const findFirst = jest.fn();
  const service = new CustomerServiceWindowService({
    messageLog: { findFirst },
  } as unknown as PrismaService);
  const now = new Date('2026-11-28T12:00:00Z');

  beforeEach(() => findFirst.mockReset());

  it('is open when there is an inbound message inside 24h - 5min', async () => {
    findFirst.mockResolvedValue({ id: 'log-1' });
    await expect(service.isOpen('m-1', '573001234567', now)).resolves.toBe(true);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.merchantId).toBe('m-1');
    expect(where.direction).toBe(MessageDirection.IN);
    expect(where.createdAt.gt).toEqual(new Date(now.getTime() - CUSTOMER_SERVICE_WINDOW_MS));
    expect(where.conversation.customer.phone.in).toEqual(
      expect.arrayContaining(['573001234567', '+573001234567']),
    );
  });

  it('is closed when there is no recent inbound message', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.isOpen('m-1', '+573001234567', now)).resolves.toBe(false);
  });

  it('window margin is 23h55m', () => {
    expect(CUSTOMER_SERVICE_WINDOW_MS).toBe((23 * 60 + 55) * 60 * 1000);
  });

  it('phoneVariants normalizes + and spaces', () => {
    expect(phoneVariants('+57 300 123')).toEqual(['+57 300 123', '57300123', '+57300123']);
  });
});
